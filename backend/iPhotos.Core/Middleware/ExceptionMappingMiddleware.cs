using iPhotos.Application.Common;
using Microsoft.IdentityModel.Tokens;

namespace iPhotos.Core.Middleware;

/// <summary>Maps application exceptions to HTTP status codes with a JSON error body.</summary>
public sealed class ExceptionMappingMiddleware(RequestDelegate next, ILogger<ExceptionMappingMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            var (status, message) = ex switch
            {
                ValidationException e => (StatusCodes.Status400BadRequest, e.Message),
                NotSupportedException e => (StatusCodes.Status501NotImplemented, e.Message),
                EmailAlreadyExistsException e => (StatusCodes.Status409Conflict, e.Message),
                UnauthorizedException e => (StatusCodes.Status401Unauthorized, e.Message),
                NotFoundException e => (StatusCodes.Status404NotFound, e.Message),
                QuotaExceededException e => (StatusCodes.Status413RequestEntityTooLarge, e.Message),
                SecurityTokenException e => (StatusCodes.Status401Unauthorized, e.Message),
                OperationCanceledException when context.RequestAborted.IsCancellationRequested =>
                    (499, "Client closed request."),
                _ => (StatusCodes.Status500InternalServerError, "An unexpected error occurred."),
            };

            if (status >= 500)
            {
                logger.LogError(ex, "Unhandled exception while processing {Method} {Path}", context.Request.Method, context.Request.Path);
            }

            context.Response.Clear();
            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new { error = message });
        }
    }
}
