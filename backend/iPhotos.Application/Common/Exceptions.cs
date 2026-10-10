namespace iPhotos.Application.Common;

/// <summary>
/// Stable machine-readable error codes returned alongside the human message in
/// `{ error, code, params? }` bodies. Clients key localized messages on these;
/// the free-text `error` remains the fallback for unknown codes.
/// </summary>
public static class ErrorCodes
{
    // Generic
    public const string Validation = "validation.invalid";
    public const string NotFound = "not_found";
    public const string NotImplemented = "not_implemented";
    public const string Internal = "internal.error";

    // Auth
    public const string AuthInvalidCredentials = "auth.invalid_credentials";
    public const string AuthRefreshInvalid = "auth.refresh_invalid";
    public const string AuthTokenInvalid = "auth.token_invalid";
    public const string AuthEmailExists = "auth.email_exists";
    public const string AuthPasswordTooShort = "auth.password_too_short";

    // Photos & upload
    public const string PhotosNotFound = "photos.not_found";
    public const string PhotosQuotaExceeded = "photos.quota_exceeded";
    public const string PhotosSizeLimitExceeded = "photos.size_limit_exceeded";
    public const string PhotosUnsupportedContentType = "photos.unsupported_content_type";
    public const string PhotosFileNameRequired = "photos.file_name_required";
    public const string PhotosFileSizeInvalid = "photos.file_size_invalid";
    public const string PhotosHashRequired = "photos.content_hash_required";
    public const string PhotosInvalidPartNumber = "photos.invalid_part_number";
    public const string PhotosNotAwaitingUpload = "photos.not_awaiting_upload";
    public const string PhotosNoMultipartSession = "photos.no_multipart_session";
    public const string PhotosMultipartMismatch = "photos.multipart_session_mismatch";
    public const string PhotosFileNotUploaded = "photos.file_not_uploaded";
    public const string PhotosVariantNotReady = "photos.variant_not_ready";
    public const string PhotosMultipartUnavailable = "photos.multipart_unavailable";
    public const string PhotosInvalidMediaType = "photos.invalid_media_type";
    public const string PhotosInvalidSort = "photos.invalid_sort";
    public const string PhotosInvalidOrder = "photos.invalid_order";
    public const string PhotosInvalidVariant = "photos.invalid_variant";
    public const string PhotosInvalidImage = "photos.invalid_image";

    // Users & preferences
    public const string UserNotFound = "users.not_found";
    public const string PrefsUnknownQuality = "prefs.unknown_quality";

    // People & faces (doc 18)
    public const string PeopleNotFound = "people.not_found";
    public const string FacesNotFound = "faces.not_found";

    // Billing
    public const string BillingTokenRequired = "billing.token_required";
    public const string BillingUnknownProduct = "billing.unknown_product";
    public const string BillingTokenAccountMismatch = "billing.token_account_mismatch";
    public const string BillingPurchaseExpired = "billing.purchase_expired";
    public const string BillingPurchaseRefunded = "billing.purchase_refunded";
    public const string BillingPurchaseUnverifiable = "billing.purchase_unverifiable";
    public const string BillingPurchaseNotFound = "billing.purchase_not_found";
    public const string BillingPurchaseInvalid = "billing.purchase_invalid";

    // Imports
    public const string ImportsJobExists = "imports.job_exists";
}

/// <summary>Base for exceptions surfaced through the API error contract.</summary>
public abstract class AppException(string message, string code) : Exception(message)
{
    /// <summary>Stable dot-separated code clients can key translations on.</summary>
    public string Code { get; } = code;

    /// <summary>Optional values for client-side localized interpolation.</summary>
    public IReadOnlyDictionary<string, string>? Params { get; init; }
}

public class ValidationException(string message, string code = ErrorCodes.Validation)
    : AppException(message, code);

public class EmailAlreadyExistsException(string email)
    : AppException($"An account with e-mail '{email}' already exists.", ErrorCodes.AuthEmailExists);

public class UnauthorizedException(
    string message = "Invalid credentials.",
    string code = ErrorCodes.AuthInvalidCredentials
) : AppException(message, code);

public class NotFoundException(string message, string code = ErrorCodes.NotFound)
    : AppException(message, code);

public class QuotaExceededException(string message)
    : AppException(message, ErrorCodes.PhotosQuotaExceeded);

/// <summary>The store rejected the purchase (forged, reused, expired or refunded token).</summary>
public class InvalidPurchaseException(string message, string code = ErrorCodes.BillingPurchaseInvalid)
    : AppException(message, code);
