# Toolchain image for building the iPhotos Android app (Expo SDK 57 / RN 0.86).
# Contains JDK 17, Node 22, Bun and the exact Android SDK pieces the project pins
# (see the [ExpoRootProject] versions printed by Gradle):
#   platforms;android-36, build-tools;36.0.0, ndk;27.1.12297006, cmake;3.22.1
FROM eclipse-temurin:17-jdk-jammy

ARG SDK_DIR=/opt/android-sdk
ARG NODE_MAJOR=22
ARG CMDLINE_TOOLS_URL=https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip

RUN apt-get update && apt-get install -y --no-install-recommends \
      unzip zip curl ca-certificates git rsync \
    && rm -rf /var/lib/apt/lists/*

# Node >= 20 is required by Expo CLI autolinking and RN codegen, which run
# during the Gradle build.
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Same package manager the project uses on the host (bun.lock).
RUN curl -fsSL https://bun.sh/install | bash \
    && ln -s /root/.bun/bin/bun /usr/local/bin/bun \
    && ln -s /root/.bun/bin/bunx /usr/local/bin/bunx

ENV ANDROID_HOME=${SDK_DIR}
ENV PATH=${SDK_DIR}/cmdline-tools/latest/bin:${SDK_DIR}/platform-tools:${PATH}

RUN mkdir -p ${SDK_DIR}/cmdline-tools \
    && curl -fsSL ${CMDLINE_TOOLS_URL} -o /tmp/cmdline-tools.zip \
    && unzip -q /tmp/cmdline-tools.zip -d ${SDK_DIR}/cmdline-tools \
    && mv ${SDK_DIR}/cmdline-tools/cmdline-tools ${SDK_DIR}/cmdline-tools/latest \
    && rm /tmp/cmdline-tools.zip \
    && yes | sdkmanager --licenses > /dev/null \
    && sdkmanager \
        "platform-tools" \
        "platforms;android-36" \
        "build-tools;36.0.0" \
        "ndk;27.1.12297006" \
        "cmake;3.22.1" > /dev/null

WORKDIR /workspace
