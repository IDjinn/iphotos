namespace iPhotos.Storage.Host;

/// <summary>Maps storage-domain exceptions to HTTP status codes with a JSON error body.</summary>
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
                InvalidObjectKeyException e => (StatusCodes.Status400BadRequest, e.Message),
                ObjectNotFoundException e => (StatusCodes.Status404NotFound, e.Message),
                ProviderNotConfiguredException e => (StatusCodes.Status400BadRequest, e.Message),
                BlockedNetworkException e => (StatusCodes.Status400BadRequest, e.Message),
                ProviderException e => (StatusCodes.Status502BadGateway, e.Message),
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
