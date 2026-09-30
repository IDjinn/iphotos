FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
# Object storage dir writable by the non-root app user (Docker volumes mount as root).
USER root
RUN mkdir -p /var/lib/iphotos/objects && chown -R $APP_UID /var/lib/iphotos
USER $APP_UID
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["iPhotos.Storage.Host/iPhotos.Storage.Host.csproj", "iPhotos.Storage.Host/"]
RUN dotnet restore "iPhotos.Storage.Host/iPhotos.Storage.Host.csproj"
COPY . .
WORKDIR "/src/iPhotos.Storage.Host"
RUN dotnet build "./iPhotos.Storage.Host.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./iPhotos.Storage.Host.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "iPhotos.Storage.Host.dll"]
