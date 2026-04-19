// Registers @testing-library/jest-dom custom matchers onto vitest's expect.
// Required for matchers like .toBeInTheDocument() / .toHaveTextContent() / etc.
import '@testing-library/jest-dom/vitest';
