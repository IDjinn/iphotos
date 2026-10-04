using System.Diagnostics;
using System.Security.Claims;
using iPhotos.Application;
using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using iPhotos.Application.Services;
using iPhotos.Domain;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.Net.Http.Headers;

namespace iPhotos.Core.Endpoints;

public static class ImportEndpoints
{
    public static IEndpointRouteBuilder MapImportEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/imports").WithTags("Imports").RequireAuthorization();

        group.MapPost("/zip", async (
            HttpContext context,
            ClaimsPrincipal principal,
            IOptions<ZipImportOptions> optionsAccessor,
            IZipImportRepository imports,
            [FromKeyedServices("staging")] IBlobStorage stagingBlobs,
            IDateTimeProvider dateTime,
            ILogger<Program> logger,
            string? fileName,
            CancellationToken cancellationToken) =>
        {
            var options = optionsAccessor.Value;
            var ownerId = principal.GetUserId();

            // This endpoint accepts multi-GB Takeout archives: raise Kestrel's request
            // cap for this request only (the global 200 MB limit stays for photos).
            // A small slack above MaxZipBytes lets ZipUploadStream throw a clean 413
            // before Kestrel resets the connection.
            if (context.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } bodySize
                && bodySize.MaxRequestBodySize < options.MaxZipBytes)
            {
                bodySize.MaxRequestBodySize = options.MaxZipBytes + 64 * 1024;
            }

            var (sectionFileName, fileBody) = await ReadZipFileSectionAsync(context, cancellationToken);

            // Native uploaders derive the part filename from the (often opaque) source
            // URI, so the real name arrives via query string when available.
            var displayFileName = SanitizeFileName(
                string.IsNullOrWhiteSpace(fileName) ? sectionFileName : fileName);

            logger.LogInformation(
                "Zip import '{FileName}': receiving archive{Length}",
                displayFileName,
                context.Request.ContentLength is { } length ? $" ({length} bytes)" : string.Empty);

            var jobId = Guid.NewGuid();
            var blobPath = BlobPaths.Import(ownerId, jobId);
            long sizeBytes;
            var stagingStarted = Stopwatch.GetTimestamp();
            try
            {
                await using var counted = new ZipUploadStream(fileBody, options.MaxZipBytes);
                await stagingBlobs.PutAsync(blobPath, counted, cancellationToken);
                sizeBytes = counted.BytesRead;
            }
            catch
            {
                // A partially staged archive is useless — drop it before surfacing the error.
                try { await stagingBlobs.DeleteAsync(blobPath, CancellationToken.None); } catch { /* best effort */ }
                throw;
            }

            logger.LogInformation(
                "Zip import '{FileName}' staged as {BlobPath} ({SizeBytes} bytes, {Elapsed:F0} ms)",
                displayFileName,
                blobPath,
                sizeBytes,
                Stopwatch.GetElapsedTime(stagingStarted).TotalMilliseconds);

            var job = ZipImportJob.Create(ownerId, displayFileName, sizeBytes, blobPath, dateTime.UtcNow);
            job.Id = jobId;
            await imports.EnqueueAsync(job, cancellationToken);

            return Results.Accepted($"/api/imports/{job.Id}", new { jobId = job.Id });
        })
        .DisableAntiforgery()
        .WithName("ImportZip");

        group.MapGet("/{id:guid}", async (
            Guid id,
            ClaimsPrincipal principal,
            IZipImportRepository imports,
            CancellationToken cancellationToken) =>
        {
            var job = await imports.GetByIdForOwnerAsync(id, principal.GetUserId(), cancellationToken)
                ?? throw new NotFoundException($"Import job '{id}' was not found.");
            return Results.Ok(ZipImportJobDto.From(job));
        });

        return app;
    }

    private static async Task<(string FileName, Stream Body)> ReadZipFileSectionAsync(
        HttpContext context, CancellationToken cancellationToken)
    {
        if (!MediaTypeHeaderValue.TryParse(context.Request.ContentType, out var contentType)
            || !contentType.MediaType.Equals("multipart/form-data", StringComparison.OrdinalIgnoreCase))
        {
            throw new ValidationException("Expected a multipart/form-data request with a 'file' field.");
        }

        var boundary = contentType.Boundary.HasValue ? contentType.Boundary.Value.Trim('"') : null;
        if (string.IsNullOrWhiteSpace(boundary))
        {
            throw new ValidationException("Multipart boundary is missing.");
        }

        var reader = new MultipartReader(boundary, context.Request.Body);
        while (await reader.ReadNextSectionAsync(cancellationToken) is { } section)
        {
            // MultipartSection.Headers is a plain Dictionary<string, StringValues>.
            if (section.Headers is not { } headers
                || !headers.TryGetValue("Content-Disposition", out var dispositionValues)
                || dispositionValues.Count == 0)
            {
                continue;
            }

            var (fieldName, sectionFileName) = ParseContentDisposition(dispositionValues.ToString());
            if (!string.Equals(fieldName, "file", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return (Path.GetFileName(sectionFileName ?? string.Empty), section.Body);
        }

        throw new ValidationException("Multipart field 'file' is required.");
    }

    private static string SanitizeFileName(string fileName)
    {
        var name = Path.GetFileName(fileName.Trim());
        if (name.Length > 200)
        {
            name = name[..200];
        }

        return string.IsNullOrWhiteSpace(name) ? "archive.zip" : name;
    }

    /// <summary>Parses form-data disposition parts: name="x"; filename="y.zip".</summary>
    private static (string? Name, string? FileName) ParseContentDisposition(string header)
    {
        string? name = null;
        string? fileName = null;
        foreach (var part in header.Split(';', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Skip(1))
        {
            var eq = part.IndexOf('=');
            if (eq <= 0)
            {
                continue;
            }

            var key = part[..eq].Trim();
            var value = part[(eq + 1)..].Trim().Trim('"');
            if (key.Equals("name", StringComparison.OrdinalIgnoreCase))
            {
                name = value;
            }
            else if (key.Equals("filename", StringComparison.OrdinalIgnoreCase))
            {
                fileName = value;
            }
        }

        return (name, fileName);
    }

    /// <summary>
    /// Validates the ZIP magic bytes ("PK\x03\x04") on the first read and counts
    /// streamed bytes, aborting once the limit is exceeded (mapped to 413 by the
    /// exception middleware). Never disposes the inner stream — it is the request
    /// body, owned by the server.
    /// </summary>
    private sealed class ZipUploadStream(Stream inner, long limit) : Stream
    {
        private bool _magicChecked;
        private byte[]? _head;
        private int _headPosition;

        public long BytesRead { get; private set; }

        public override bool CanRead => inner.CanRead;

        public override bool CanSeek => false;

        public override bool CanWrite => false;

        public override long Length => throw new NotSupportedException();

        public override long Position
        {
            get => throw new NotSupportedException();
            set => throw new NotSupportedException();
        }

        public override int Read(byte[] buffer, int offset, int count) =>
            ReadAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            if (!_magicChecked)
            {
                _magicChecked = true;
                var head = new byte[4];
                var read = 0;
                while (read < head.Length)
                {
                    var chunk = await inner.ReadAsync(head.AsMemory(read, head.Length - read), cancellationToken);
                    if (chunk == 0)
                    {
                        break;
                    }

                    read += chunk;
                }

                if (read < head.Length || head[0] != 0x50 || head[1] != 0x4B || head[2] != 0x03 || head[3] != 0x04)
                {
                    throw new ValidationException("The selected file is not a ZIP archive.");
                }

                _head = head;
                _headPosition = 0;
            }

            if (_headPosition < _head!.Length)
            {
                var n = Math.Min(_head.Length - _headPosition, buffer.Length);
                _head.AsSpan(_headPosition, n).CopyTo(buffer.Span);
                _headPosition += n;
                BytesRead += n;
                return n;
            }

            var readBytes = await inner.ReadAsync(buffer, cancellationToken);
            if (readBytes > 0)
            {
                BytesRead += readBytes;
                if (BytesRead > limit)
                {
                    throw new QuotaExceededException(
                        $"ZIP exceeds the maximum accepted size of {limit / (double)(1L << 30):0.#} GiB.");
                }
            }

            return readBytes;
        }

        public override void Flush() { }

        public override Task FlushAsync(CancellationToken cancellationToken) => Task.CompletedTask;

        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

        public override void SetLength(long value) => throw new NotSupportedException();

        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        public override ValueTask DisposeAsync() => ValueTask.CompletedTask;

        protected override void Dispose(bool disposing) { }
    }
}
