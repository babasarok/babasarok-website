import type {
    BaseField,
    BooleanField,
    ColorField,
    Field,
    InputField,
    Option,
    Product,
    ProductMaterial,
    RadioField,
    SelectField,
} from "../../tina/productTypes";
import type { Material, MaterialColor } from "../../tina/materialTypes";
import { v4 } from "uuid";

export interface ResolvedMaterial extends Material {
    colors?: MaterialColor[];
}

export interface ProductMaterialResolved extends ProductMaterial {
    material: ResolvedMaterial;
}

export type InputFieldResolved = InputField & {
    type: "input";
    items: Option[];
};

export type SelectFieldResolved = SelectField & {
    type: "select";
    items: Option[];
};

export type RadioFieldResolved = RadioField & {
    type: "radio";
    items: Option[];
};

export type ColorFieldResolved = ColorField & {
    type: "color";
    items: Option[];
};

export type BooleanFieldResolved = BooleanField & {
    type: "toggle";
};

export type FieldResolved =
    | InputFieldResolved
    | SelectFieldResolved
    | RadioFieldResolved
    | ColorFieldResolved
    | BooleanFieldResolved;

export type InputFieldInternal = InputFieldResolved & {
    value?: ValueWithError;
};

export type SelectFieldInternal = SelectFieldResolved & {
    value?: ValueWithError;
};

export type RadioFieldInternal = RadioFieldResolved & {
    value?: ValueWithError;
};

export type ColorFieldInternal = ColorFieldResolved & {
    value?: ValueWithError;
};

export type BooleanFieldInternal = BooleanFieldResolved & {
    value?: ValueWithError;
};

export type FieldInternal =
    | InputFieldInternal
    | SelectFieldInternal
    | RadioFieldInternal
    | ColorFieldInternal
    | BooleanFieldInternal;

export interface ValueWithError {
    value: string;
    is_custom?: boolean;
    error?: string | undefined;
}

export interface ProductMaterialValue {
    material_id: string;
    colors: string[];
    custom_color?: string | undefined;
    error?: string | undefined;
}

export interface IProductMaterialInternal extends Omit<ProductMaterialResolved, "color_count"> {
    color_count: number | undefined;
}

export interface ProductResolved extends Product {
    materials?: ProductMaterialResolved[];
    fields?: FieldResolved[];
}

export interface IProductItem extends Omit<ProductResolved, "materials"> {
    uuid: string;
    count: number;
    material_values?: ProductMaterialValue[];
    materials: ProductMaterialInternal[];
    fields?: FieldInternal[];
}

export class ProductMaterialInternal implements IProductMaterialInternal {
    material: ResolvedMaterial;
    price?: number | undefined;
    color_count: number | undefined;
    private original_color_count: string;
    material_path: string;

    private resolveColorCount(name: string, product: Pick<IProductItem, "fields">): number | undefined {
        const current = product.fields?.find((f) => f.name === name)?.value?.value;

        if (!current) {
            return undefined;
        }

        const val = Number.parseFloat(current);

        if (Number.isNaN(val)) {
            return undefined;
        }

        return val;
    }

    constructor(material: ProductMaterialResolved, product: Pick<IProductItem, "fields">) {
        this.material_path = $state($state.snapshot(material.material_path));
        this.material = $state($state.snapshot(material.material));
        this.price = $state($state.snapshot(material.price));
        this.original_color_count = $state($state.snapshot(material.color_count ?? "1"));
        this.color_count = $derived.by(() => {
            const val = Number.parseFloat(this.original_color_count);

            if (!Number.isNaN(val)) {
                return val;
            }

            // value might be a reference to a field, try to resolve it
            const current = product.fields?.find((f) => f.name === this.original_color_count)?.value?.value;
            if (!current) {
                return undefined;
            }

            const res = Number.parseFloat(current);

            if (Number.isNaN(res)) {
                return undefined;
            }

            return res;
        });
    }

    public clone(product: Pick<IProductItem, "fields">): ProductMaterialInternal {
        return new ProductMaterialInternal(
            {
                material_path: this.material_path,
                material: this.material,
                price: this.price,
                color_count: this.original_color_count,
            },
            product
        );
    }
}

export class ProductItem implements IProductItem {
    uuid: string = v4();
    count: number = $state(1);
    product_id: string;
    name: string;

    material_values?: ProductMaterialValue[];
    materials: ProductMaterialInternal[];
    material_required_count?: number | undefined;
    private original_materials?: ProductMaterialResolved[];
    fields?: FieldInternal[];
    icon?: string | undefined;
    priced_by_length?: boolean | undefined;
    price?: number | undefined;

    constructor(item: ProductResolved) {
        this.product_id = $state(item.product_id);
        this.name = $state(item.name);
        this.icon = $state(item.icon);
        this.priced_by_length = $state(item.priced_by_length);
        this.price = $state(item.price);
        this.original_materials = item.materials;
        this.material_required_count = $state(item.material_required_count);
        this.fields = $state(item.fields);
        this.materials = item.materials?.map((m) => new ProductMaterialInternal(m, { fields: this.fields })) ?? [];
        this.material_values = $state();
    }

    clone(): ProductItem {
        return new ProductItem({
            product_id: $state.snapshot(this.product_id),
            name: $state.snapshot(this.name),
            icon: $state.snapshot(this.icon),
            priced_by_length: $state.snapshot(this.priced_by_length),
            price: $state.snapshot(this.price),
            materials: this.original_materials,
            material_required_count: $state.snapshot(this.material_required_count),
            fields: $state.snapshot(this.fields),
        });
    }
}

export function nonEmptyObject<T extends Record<string, any>>(obj: T): obj is Exclude<T, Record<string, never>> {
    return Object.keys(obj).length > 0;
}
