namespace iPhotos.Domain;

/// <summary>
/// User-selected upload quality, stored on the account and applied server-side:
/// "original" keeps the uploaded bytes as-is (up to the plan cap); "storageSaver"
/// has the worker compress/transcode files that exceed the saver caps.
/// </summary>
public static class UploadQualities
{
    public const string Original = "original";
    public const string StorageSaver = "storageSaver";

    public static bool IsValid(string value) => value is Original or StorageSaver;
}
