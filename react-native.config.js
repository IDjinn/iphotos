/**
 * onnxruntime-react-native ships a legacy `unimodule.json` declaring itself an
 * Expo module for android, but without `android.gradlePath`. Expo SDK 57's
 * autolinking treats that as a RN-vs-Expo module conflict and silently drops
 * the package — so the native module never registers and
 * `NativeModules.Onnxruntime` is undefined at runtime.
 * This override pins the package to the plain React Native linking path.
 */
module.exports = {
  dependencies: {
    'onnxruntime-react-native': {
      platforms: {
        android: {
          packageImportPath: 'import ai.onnxruntime.reactnative.OnnxruntimePackage;',
          packageInstance: 'new OnnxruntimePackage()',
        },
      },
    },
  },
};
