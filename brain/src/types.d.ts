// Type stubs for Payload-generated side-effect CSS imports.
// These packages ship CSS under a subpath export but no .d.ts, so a bare
// `import '@payloadcms/next/css'` (in Payload's DO-NOT-MODIFY generated files)
// fails type-checking. Declaring the module satisfies the side-effect import.
declare module '@payloadcms/next/css'
