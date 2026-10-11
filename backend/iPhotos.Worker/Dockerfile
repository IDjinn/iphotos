FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
# Blob storage dir writable by the non-root app user (Docker volumes mount as root).
USER root
RUN mkdir -p /var/lib/iphotos/blobs /var/lib/iphotos/ml-inputs && chown -R $APP_UID /var/lib/iphotos
# ffmpeg/ffprobe: video probing + poster frames for imports and the presigned flow.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
USER $APP_UID
WORKDIR /app

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["iPhotos.Worker/iPhotos.Worker.csproj", "iPhotos.Worker/"]
COPY ["iPhotos.Application/iPhotos.Application.csproj", "iPhotos.Application/"]
COPY ["iPhotos.Domain/iPhotos.Domain.csproj", "iPhotos.Domain/"]
COPY ["iPhotos.Infrastructure/iPhotos.Infrastructure.csproj", "iPhotos.Infrastructure/"]
COPY ["iPhotos.Imaging/iPhotos.Imaging.csproj", "iPhotos.Imaging/"]
RUN dotnet restore "iPhotos.Worker/iPhotos.Worker.csproj"
COPY . .
WORKDIR "/src/iPhotos.Worker"
RUN dotnet build "./iPhotos.Worker.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./iPhotos.Worker.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "iPhotos.Worker.dll"]
