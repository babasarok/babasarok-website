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

export type RecursivelyRemoveKeys<T, K extends string> =
  T extends Array<infer U>
    ? Array<RecursivelyRemoveKeys<U, K>>
    : T extends object
      ? {
          [P in keyof T as P extends K ? never : P]: RecursivelyRemoveKeys<T[P], K>;
        }
      : T;

export type NullableToUndefined<T> = T extends null ? Exclude<T, null> | undefined : T;

export type RecursivelyNullableToUndefined<T> =
  T extends Array<infer U>
    ? Array<RecursivelyNullableToUndefined<U>>
    : T extends object
      ? {
          [P in keyof T]: RecursivelyNullableToUndefined<NullableToUndefined<T[P]>>;
        }
      : NullableToUndefined<T>;

/** Marker used by {@link RecursiveDiff} for a property that exists on one side but not the other. */
type Missing = "(missing)";

/** Indexed access that falls back to {@link Missing} when the key is absent. */
type Prop<T, K extends PropertyKey> = K extends keyof T ? T[K] : Missing;

/**
 * A single-property slice of `T`, so equality checks keep the optional (`?`)
 * modifier — a bare indexed access (`T[K]`) would drop it and hide the very
 * difference we're trying to surface.
 */
type PickProp<T, K extends PropertyKey> = K extends keyof T ? Pick<T, K> : Record<never, never>;

/** One flattened diff: a dotted `path` and the `{ left; right }` found there. */
interface DiffEntry {
  path: string;
  diff: unknown;
}

/** Join a path prefix and a key with `.` (no leading dot at the root). */
type JoinPath<Prefix extends string, K extends PropertyKey> = Prefix extends ""
  ? K & string
  : `${Prefix}.${K & string}`;

/**
 * Walk `T` vs `U` and emit a union of {@link DiffEntry} — one per point where
 * they diverge — with `path` accumulated in `a.b.c` notation (and `[number]`
 * for array elements).
 *
 * Equality is tested with {@link IfEquals} (identity) at every level, so pairs
 * that are mutually assignable but not identical (an optional modifier, an
 * added `undefined`, …) still surface. A property present on only one side
 * shows `"(missing)"` for the absent side; a property that differs solely by
 * optionality reports its single-key {@link Pick} slice so the `?` is visible.
 *
 * `undefined` / `null` are stripped ({@link NonNullable}) before the structural
 * checks so nullable objects (`X | undefined`) are still recursed into. When
 * that strip is the *only* difference, the node is reported as a leaf showing
 * both nullable forms.
 */
type DiffEntries<T, U, Prefix extends string = ""> =
  IfEquals<T, U> extends true
    ? never
    : NonNullable<T> extends infer NT
      ? NonNullable<U> extends infer NU
        ? IfEquals<NT, NU> extends true
          ? { path: Prefix; diff: { left: T; right: U } }
          : [NT, NU] extends [ReadonlyArray<infer TE>, ReadonlyArray<infer UE>]
            ? DiffEntries<TE, UE, `${Prefix}[number]`>
            : [NT, NU] extends [object, object]
              ? {
                  [K in keyof NT | keyof NU]: IfEquals<
                    PickProp<NT, K>,
                    PickProp<NU, K>
                  > extends true
                    ? never
                    : IfEquals<Prop<NT, K>, Prop<NU, K>> extends true
                      ? {
                          path: JoinPath<Prefix, K>;
                          diff: { left: PickProp<NT, K>; right: PickProp<NU, K> };
                        }
                      : DiffEntries<Prop<NT, K>, Prop<NU, K>, JoinPath<Prefix, K>>;
                }[keyof NT | keyof NU]
              : { path: Prefix; diff: { left: T; right: U } }
        : never
      : never;

/**
 * Recursive structural difference between two types, flattened into a single
 * object whose keys are dotted paths (`a.b.c`, `list[number].id`) pointing at
 * every spot where `T` and `U` diverge — so nested mismatches are visible at a
 * glance instead of being buried in a nested shape.
 *
 * Each value is `{ left: <T side>; right: <U side> }`. A property missing on
 * one side shows `"(missing)"`; a property differing only by optionality shows
 * its single-key slice (`{ k?: V }` vs `{ k: V }`). Fully-equal types resolve
 * to `never`.
 *
 * Hover the resulting alias (e.g. `ProductDiff`) to read the difference.
 */
export type RecursiveDiff<T, U> =
  IfEquals<T, U> extends true
    ? never
    : DiffEntries<T, U> extends infer E extends DiffEntry
      ? { [P in E["path"]]: Extract<E, { path: P }>["diff"] }
      : never;

/**
 * Recursively make every property of `T` required (removing `?` at every
 * depth). Types assignable to `Stop` are treated as leaves: they are left
 * untouched and not descended into, so their own optional members stay
 * optional. The `Stop` check distributes over unions, so a `Stop | undefined`
 * member is preserved as-is while the rest of the value is still made required.
 */
export type RecursiveRequired<T, Stop = never> = T extends Stop
  ? T
  : T extends Array<infer U>
    ? Array<RecursiveRequired<U, Stop>>
    : T extends object
      ? { [K in keyof T]-?: RecursiveRequired<T[K], Stop> }
      : T;

export type RecursivelyReplaceType<T, From, To> = T extends From
  ? To
  : T extends Array<infer U>
    ? Array<RecursivelyReplaceType<U, From, To>>
    : T extends object
      ? { [K in keyof T]: RecursivelyReplaceType<T[K], From, To> }
      : T;
