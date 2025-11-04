// Re-export the components-based DriverMap to avoid duplicate static native imports in web bundle.
// This file used to import `react-native-maps` directly which caused Metro to try bundling native-only
// modules for web and fail. We re-export the safe implementation from the project-level `components`.

export { default } from '../../components/DriverMap';
