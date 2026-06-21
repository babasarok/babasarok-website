import { v4 } from "uuid";
import type { Field, ProductMaterialValue, TinaProductResolved, TinaResolvedProductMaterial } from "./types.svelte";
import { ProductMaterial } from "./ProductMaterial.svelte";
import type { Serialised } from "./typeUtils";

export interface IProduct extends Required<Omit<TinaProductResolved, "materials">> {
    uuid: string;
    count: number;
    materials: {
        materials: ProductMaterial[];
        values: Array<ProductMaterialValue | undefined>;
        material_required_count: number;
    }
    fields: Field[];
}

export class Product implements IProduct {
    uuid: string = v4();
    count: number = $state(1);
    product_id: string;
    title: string;

    material_values: Array<ProductMaterialValue | undefined>;
    materials: {
        /** allowed materials to select */
        materials: ProductMaterial[];
        values: Array<ProductMaterialValue | undefined>;
        material_required_count: number;
    }
    private original_materials: TinaResolvedProductMaterial[];
    fields: Field[];
    icon: string | undefined;
    priced_by_length: boolean | undefined;
    price: number;
    product_path: string;
    discount: number | undefined;
    discount_valid_until: Date | undefined;

    constructor(item: TinaProductResolved) {
        this.product_id = $state(item.product_id);
        this.title = $state(item.title);
        this.icon = $state(item.icon);
        this.priced_by_length = $state(item.priced_by_length);
        this.price = $state(item.price);
        this.original_materials = item.materials?.materials ?? [];
        this.fields = $state(item.fields ?? []);
        this.materials = $state({
            materials: item.materials?.materials?.map((m) => new ProductMaterial(m, { fields: this.fields })) ?? [],
            values: [],
            material_required_count: item.materials?.material_required_count ?? 1,
        });
        this.material_values = $state([]);
        this.product_path = item.product_path;
        this.discount = $state(item.discount);
        this.discount_valid_until = $state(item.discount_valid_until);
    }

    clone(): Product {
        return new Product({
            product_id: $state.snapshot(this.product_id),
            title: $state.snapshot(this.title),
            icon: $state.snapshot(this.icon),
            priced_by_length: $state.snapshot(this.priced_by_length),
            price: $state.snapshot(this.price),
            materials: {
                materials: this.original_materials,
                material_required_count: $state.snapshot(this.materials.material_required_count),
            },
            fields: $state.snapshot(this.fields),
            product_path: $state.snapshot(this.product_path),
            discount: $state.snapshot(this.discount),
            discount_valid_until: $state.snapshot(this.discount_valid_until),
        });
    }

    serialise(): Serialised<IProduct> {
        return {
            product_id: $state.snapshot(this.product_id),
            title: $state.snapshot(this.title),
            icon: $state.snapshot(this.icon),
            priced_by_length: $state.snapshot(this.priced_by_length),
            price: $state.snapshot(this.price),
            materials: {
                materials: this.materials.materials.map((m) => m.serialise()),
                values: $state.snapshot(this.materials.values),
                material_required_count: $state.snapshot(this.materials.material_required_count),
            },
            fields: $state.snapshot(this.fields),
            product_path: $state.snapshot(this.product_path),
            discount: $state.snapshot(this.discount),
            discount_valid_until: $state.snapshot(this.discount_valid_until),
            count: $state.snapshot(this.count),
            uuid: $state.snapshot(this.uuid),
        };
    }
}
