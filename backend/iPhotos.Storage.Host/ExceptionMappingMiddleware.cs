namespace iPhotos.Storage.Host;

/// <summary>
/// Maps storage-domain exceptions to HTTP status codes with a JSON error body of
/// `{ error, code }` — `code` is a stable machine-readable key for clients.
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
                InvalidObjectKeyException e => (StatusCodes.Status400BadRequest, e.Message, StorageErrorCodes.InvalidKey),
                ObjectNotFoundException e => (StatusCodes.Status404NotFound, e.Message, StorageErrorCodes.ObjectNotFound),
                ProviderNotConfiguredException e => (StatusCodes.Status400BadRequest, e.Message, StorageErrorCodes.ProviderNotConfigured),
                BlockedNetworkException e => (StatusCodes.Status400BadRequest, e.Message, StorageErrorCodes.NetworkBlocked),
                ProviderException e => (StatusCodes.Status502BadGateway, e.Message, StorageErrorCodes.ProviderError),
                OperationCanceledException when context.RequestAborted.IsCancellationRequested =>
                    (499, "Client closed request.", "client_closed"),
                _ => (StatusCodes.Status500InternalServerError, "An unexpected error occurred.", StorageErrorCodes.Internal),
            };

            if (status >= 500)
            {
                logger.LogError(ex, "Unhandled exception while processing {Method} {Path}", context.Request.Method, context.Request.Path);
            }

            context.Response.Clear();
            context.Response.StatusCode = status;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsJsonAsync(new { error = message, code });
        }
    }
}
