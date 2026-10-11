FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
# Blob storage dir writable by the non-root app user (Docker volumes mount as root).
USER root
RUN mkdir -p /var/lib/iphotos/blobs /var/lib/iphotos/ml-inputs && chown -R $APP_UID /var/lib/iphotos
# ffmpeg/ffprobe: video probing + poster frames for video uploads.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
USER $APP_UID
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["iPhotos.Core/iPhotos.Core.csproj", "iPhotos.Core/"]
RUN dotnet restore "iPhotos.Core/iPhotos.Core.csproj"
COPY . .
WORKDIR "/src/iPhotos.Core"
RUN dotnet build "./iPhotos.Core.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./iPhotos.Core.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "iPhotos.Core.dll"]
