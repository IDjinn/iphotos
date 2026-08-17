# Build APK local via WSL (sem fila do EAS)

Gera o APK debug-signed direto na máquina pra testar — em especial as permissões de galeria (`expo-media-library`), que não funcionam no Expo Go. Diferente do milenio-quiz (managed + `eas build --local`), aqui o build é Gradle direto na pasta `android/` gerada pelo prebuild: sem login do EAS, sem fila, sem `eas.json`.

O fluxo espelha o `docker-compose.yml` do projeto (mesma toolchain), só que direto no WSL — sem a camada do Docker. Tudo automatizado em `scripts/build-wsl.sh`.

## Por que release e não debug?

- `assembleRelease` → APK **standalone** (JS embutido no APK): instala e funciona sem Metro. É o que se quer pra testar permissões.
- `assembleDebug` → APK que carrega JS do Metro (`npx expo start` + `adb reverse tcp:8081 tcp:8081`). Usar só no workflow de dev com live reload.

O `release` aqui é assinado com o **debug keystore** (default do template Expo). Serve pra teste local; pra Play Store, gerar keystore próprio.

## Pré-requisitos (uma vez só)

Rodar tudo dentro do WSL (distro Ubuntu). Se você já seguiu o `BUILD_WSL.md` do milenio-quiz, os passos 2–4 já estão prontos — o SDK tem exatamente as versões que este projeto usa (android-36, build-tools 36.0.0, NDK 27.1.12297006, cmake 3.22.1).

### 1. Limite de memória do WSL (`.wslconfig`)

Num host de 16GB, o WSL2 pega 50% (7.7GB) por padrão — **não basta**: Gradle daemon + compilação Kotlin + C++ (NDK) + Metro bundling do release (React Compiler) estouram e o OOM killer derruba o build no meio (sem mensagem de erro, o daemon simplesmente morre). Criar `C:\Users\<usuario>\.wslconfig`:

```ini
[wsl2]
memory=9GB
swap=12GB
processors=8
```

Aplicar (derruba todas as distros, inclusive a do Docker — ela volta sozinha):
```powershell
wsl --shutdown
```

### 2. JDK 17
```bash
sudo apt-get update
sudo apt-get install -y openjdk-17-jdk unzip curl rsync
```

### 3. Android SDK (cmdline-tools + platform + build-tools + NDK)
```bash
mkdir -p ~/Android/Sdk/cmdline-tools
cd /tmp
curl -sSL -o cmdline-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q cmdline-tools.zip -d ~/Android/Sdk/cmdline-tools
mv ~/Android/Sdk/cmdline-tools/cmdline-tools ~/Android/Sdk/cmdline-tools/latest

export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006" "cmake;3.22.1"
```

Adicionar no `~/.bashrc` pra persistir:
```bash
export ANDROID_HOME=$HOME/Android/Sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```

### 4. Node 20+ via nvm

O Gradle roda o autolinking do Expo durante o build, que exige Node ≥20 (o Node 18 do apt do WSL não serve).
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm alias default 20
```

### 5. Bun

O projeto usa `bun.lock` — instalar com o mesmo package manager pra garantir lockfile consistente.
```bash
curl -fsSL https://bun.sh/install | bash
```

## Build

Um comando só (sincroniza, instala deps, builda, copia o APK pro Windows):

```bash
bash /mnt/c/dev/react-native/iphotos/scripts/build-wsl.sh [debug|release] [abi]
```

- Variante padrão: `release` (APK standalone). `debug` pra usar com Metro.
- ABI padrão: `arm64-v8a` (celulares físicos modernos). Pra emulador, passar `x86_64`. ABI única corta a compilação C++ em ~4x (tempo e memória).

Saída: `C:\Users\<usuario>\Downloads\iphotos-<variante>-<abi>.apk` (ex.: `iphotos-release-arm64-v8a.apk`)

O que o script faz por baixo:

1. **rsync** do projeto pra `~/build/iphotos` (ext4 nativo do WSL). Compilar C++ atravessando o mount `/mnt/c` é ordens de magnitude mais lento — mesmo papel que o volume do Docker faz no fluxo com compose. Os excludes de `build/`/`.gradle` preservam os artefatos entre builds (Gradle reusa o que já compilou).
2. **`bun install`** no copy Linux-native (node_modules do Windows não serve pro build no Linux).
3. **Tuning de memória** anexado ao `gradle.properties` do copy (`-Xmx3072m`, Kotlin in-process, `workers.max=3`) — necessário pra caber no limite do WSL, ver pré-requisito 1.
4. **`./gradlew assemble<Variant> -PreactNativeArchitectures=<abi>`** com JDK 17 + Node 20 no env.

Do Windows (PowerShell/Git Bash), a chamada precisa desligar a conversão de path do MSYS:
```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -e bash /mnt/c/dev/react-native/iphotos/scripts/build-wsl.sh
```

### Instalar no celular físico

No celular (habilitar "fontes desconhecidas"), ou via adb:
```bash
adb install iphotos-release-arm64-v8a.apk
```

## Testar no emulador

O emulador roda no Windows (AVD `Pixel_10_Pro_XL`); o WSL só gera o APK. Emulador é **x86_64** — o APK `arm64-v8a` não instala nele (`INSTALL_FAILED_NO_MATCHING_ABIS`), e vice-versa pro celular.

### 1. Buildar a variante do emulador

```bash
bash /mnt/c/dev/react-native/iphotos/scripts/build-wsl.sh release x86_64
```

### 2. Subir o emulador (se não estiver rodando)

Pelo Device Manager do Android Studio, ou pelo terminal (Windows):
```powershell
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Pixel_10_Pro_XL
```
Conferir que está visível: `adb devices`.

### 3. Instalar e abrir

```bash
adb install -r C:\Users\<usuario>\Downloads\iphotos-release-x86_64.apk
adb shell monkey -p com.idjinn.iphotos -c android.intent.category.LAUNCHER 1
```
(`-r` reinstala por cima mantendo dados; o `monkey` é só um `am start` de uma linha.)

### 4. Permissões de galeria

Na primeira interação com a aba Photos o app pede `READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO` (dialog do sistema). Pra conferir/conceder por comando:
```bash
adb shell dumpsys package com.idjinn.iphotos | grep READ_MEDIA
adb shell pm grant com.idjinn.iphotos android.permission.READ_MEDIA_IMAGES
adb shell pm grant com.idjinn.iphotos android.permission.READ_MEDIA_VIDEO
```
AVD recém-criado tem a galeria **vazia** — "No photos yet" com permissão concedida é o comportamento certo. Pra ter fotos pra testar: tirar screenshots no próprio emulador, baixar imagens pelo navegador dele, ou `adb push` pro `/sdcard/Pictures` e reiniciar o app.

## Notas

- Projeto é CNG: `android/` é gerado pelo prebuild e está no `.gitignore`. Se mudar permissões/plugins no `app.json`, regenerar antes do build: `cd ~/build/iphotos && bunx expo prebuild -p android --clean --no-install` (o `--clean` descarta o `android/` atual e regenera do zero).
- Primeiro build ~8–20 min (baixa dependências, compila tudo). Seguintes reusam Gradle daemon + caches (`~/.gradle` e `android/*/build` preservados pelo rsync) — uma mudança de ABI/kotlin vira build de poucos minutos.
- Edite o código no Windows (`C:\dev\react-native\iphotos`); o script leva a mudança pro build com o rsync. O `~/build/iphotos` é descartável — pode apagar e recriar.
- Se o build morrer no meio **sem mensagem de erro** (log termina abrupto, exit 1), é OOM: conferir o `.wslconfig` (pré-requisito 1) e `dmesg | grep -i oom` dentro do WSL.
- Sem EAS no caminho: não precisa de login, `eas.json` nem projectId. Se um dia precisar de build na nuvem, o caminho é o mesmo do `BUILD_WSL.md` do milenio-quiz (`eas build --local` exige login mesmo rodando local).
- Permissões de galeria (`READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_VISUAL_USER_SELECTED` etc.) são assadas no `AndroidManifest.xml` pelo prebuild a partir do `app.json` + plugin do `expo-media-library` — o APK já nasce pedindo as permissões certas na primeira execução.
