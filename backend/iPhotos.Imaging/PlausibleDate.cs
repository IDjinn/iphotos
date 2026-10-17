namespace iPhotos.Imaging;

/// <summary>
/// Container metadata often stores "unset" as an epoch-zero timestamp (Unix 1970-01-01,
/// QuickTime 1904-01-01, or an all-zero EXIF date). Those are not real capture dates and
/// would surface as bogus 1969/1970 months in the timeline.
/// </summary>
internal static class PlausibleDate
{
    private static readonly DateTimeOffset Floor = new(1971, 1, 1, 0, 0, 0, TimeSpan.Zero);

    public static DateTimeOffset? OrNull(DateTimeOffset? value) =>
        value is { } date && date >= Floor ? date : null;
}
