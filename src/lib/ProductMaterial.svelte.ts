import type { IProduct } from "./Product.svelte";
import type { TinaResolvedMaterial, TinaResolvedProductMaterial } from "./types.svelte";

export interface IProductMaterial extends Required<Omit<TinaResolvedProductMaterial, "color_count">> {
    color_count: number | undefined;
}

export class ProductMaterial implements IProductMaterial {
    material: TinaResolvedMaterial;
    price: number;
    color_count: number | undefined;
    private original_color_count: string;
    material_path: string;

    constructor(material: TinaResolvedProductMaterial, product: Pick<IProduct, "fields">) {
        this.material_path = $state($state.snapshot(material.material_path));
        this.material = $state($state.snapshot(material.material));
        this.price = $state($state.snapshot(material.price ?? undefined));
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

    public clone(product: Pick<IProduct, "fields">): ProductMaterial {
        return new ProductMaterial(
            {
                material_path: this.material_path,
                material: this.material,
                price: this.price,
                color_count: this.original_color_count,
            },
            product
        );
    }

    public serialise(): IProductMaterial {
        return {
            color_count: $state.snapshot(this.color_count),
            material: $state.snapshot(this.material),
            price: $state.snapshot(this.price),
            material_path: $state.snapshot(this.material_path),
        };
    }
}
