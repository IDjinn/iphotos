namespace iPhotos.Application.Common;

public class ValidationException(string message) : Exception(message);

public class EmailAlreadyExistsException(string email)
    : Exception($"An account with e-mail '{email}' already exists.");

public class UnauthorizedException(string message = "Invalid credentials.") : Exception(message);

public class NotFoundException(string message) : Exception(message);

public class QuotaExceededException(string message) : Exception(message);

/// <summary>The store rejected the purchase (forged, reused, expired or refunded token).</summary>
public class InvalidPurchaseException(string message) : Exception(message);
