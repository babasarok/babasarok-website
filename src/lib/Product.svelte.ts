import { v4 } from "uuid";
import type { Field, ProductMaterialValue, TinaProductResolved, TinaResolvedProductMaterial } from "./types.svelte";
import { ProductMaterial } from "./ProductMaterial.svelte";

export interface IProduct extends Omit<TinaProductResolved, "materials"> {
    uuid: string;
    count: number;
    material_values: Array<ProductMaterialValue | undefined>;
    materials: ProductMaterial[];
    fields?: Field[];
    material_required_count: number;
}

export class Product implements IProduct {
    uuid: string = v4();
    count: number = $state(1);
    product_id: string;
    name: string;

    material_values: Array<ProductMaterialValue | undefined>;
    materials: ProductMaterial[];
    material_required_count: number;
    private original_materials?: TinaResolvedProductMaterial[];
    fields?: Field[];
    icon?: string | undefined;
    priced_by_length?: boolean | undefined;
    price?: number | undefined;
    product_path: string;

    constructor(item: TinaProductResolved) {
        this.product_id = $state(item.product_id);
        this.name = $state(item.name);
        this.icon = $state(item.icon);
        this.priced_by_length = $state(item.priced_by_length);
        this.price = $state(item.price);
        this.original_materials = item.materials;
        this.material_required_count = $state(item.material_required_count ?? 1);
        this.fields = $state(item.fields);
        this.materials = item.materials?.map((m) => new ProductMaterial(m, { fields: this.fields })) ?? [];
        this.material_values = $state([]);
        this.product_path = item.product_path;
    }

    clone(): Product {
        return new Product({
            product_id: $state.snapshot(this.product_id),
            name: $state.snapshot(this.name),
            icon: $state.snapshot(this.icon),
            priced_by_length: $state.snapshot(this.priced_by_length),
            price: $state.snapshot(this.price),
            materials: this.original_materials,
            material_required_count: $state.snapshot(this.material_required_count),
            fields: $state.snapshot(this.fields),
            product_path: $state.snapshot(this.product_path),
        });
    }
}
