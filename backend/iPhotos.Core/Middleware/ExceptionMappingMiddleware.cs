using iPhotos.Application.Abstractions;
using iPhotos.Application.Common;
using Microsoft.IdentityModel.Tokens;

namespace iPhotos.Core.Middleware;

/// <summary>
/// Maps application exceptions to HTTP status codes with a JSON error body of
/// `{ error, code, params? }` — `error` is the human-readable fallback text,
/// `code` a stable machine-readable key for client-side localization.
/// </summary>
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
            var (status, message, code) = ex switch
            {
                ValidationException e => (StatusCodes.Status400BadRequest, e.Message, e.Code),
                InvalidImageException e => (StatusCodes.Status400BadRequest, e.Message, e.Code),
                NotSupportedException e => (StatusCodes.Status501NotImplemented, e.Message, ErrorCodes.NotImplemented),
                EmailAlreadyExistsException e => (StatusCodes.Status409Conflict, e.Message, e.Code),
                UnauthorizedException e => (StatusCodes.Status401Unauthorized, e.Message, e.Code),
                NotFoundException e => (StatusCodes.Status404NotFound, e.Message, e.Code),
                QuotaExceededException e => (StatusCodes.Status413RequestEntityTooLarge, e.Message, e.Code),
                InvalidPurchaseException e => (StatusCodes.Status400BadRequest, e.Message, e.Code),
                SecurityTokenException e => (StatusCodes.Status401Unauthorized, e.Message, ErrorCodes.AuthTokenInvalid),
                OperationCanceledException when context.RequestAborted.IsCancellationRequested =>
                    (499, "Client closed request.", "client_closed"),
                _ => (StatusCodes.Status500InternalServerError, "An unexpected error occurred.", ErrorCodes.Internal),
            };

            if (status >= 500)
            {
                logger.LogError(ex, "Unhandled exception while processing {Method} {Path}", context.Request.Method, context.Request.Path);
            }

            object body = ex is AppException { Params: { Count: > 0 } pars }
                ? new { error = message, code, @params = pars }
                : new { error = message, code };

            context.Response.Clear();
            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(body);
        }
    }
}
