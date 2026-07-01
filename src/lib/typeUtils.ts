export type ExcludeValues<T, U> = {
  [K in keyof T]: T[K] extends U ? never : T[K];
};

export type ExtractValues<T, U> = {
  [K in keyof T]: T[K] extends U ? T[K] : never;
};

export type Serialised<T> = {
  [K in keyof T]: T[K] extends { serialise: () => infer R } ? R : Serialised<T[K]>;
};

/** Returns `true` if T and U matches, return `false` otherwise */
export type IfEquals<T, U, Y = true, N = false> =
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  (<G>() => G extends T ? 1 : 2) extends <G>() => G extends U ? 1 : 2 ? Y : N;

/**
 * This is for build-time type-checking, will be stripped by tree-shaking because it does nothing
 *
 * @example
 * AssertTrue<IfEquals<MyType, MyOtherType>>();
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-unnecessary-type-parameters
export function AssertTrue<T extends true>(): void {}
