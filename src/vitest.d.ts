// Makes the jest-dom matcher augmentation (toBeInTheDocument, etc.) visible to
// tsc for the .test.tsx files. The runtime registration is in vitest.setup.ts.
import "@testing-library/jest-dom/vitest";
