export type ExcludeValues<T, U> = {
    [K in keyof T]: T[K] extends U ? never : T[K];
};

export type ExtractValues<T, U> = {
    [K in keyof T]: T[K] extends U ? T[K] : never;
};

export type Serialised<T> = {
    [K in keyof T]: T[K] extends { serialise: () => infer R } ? R : Serialised<T[K]>;
};
