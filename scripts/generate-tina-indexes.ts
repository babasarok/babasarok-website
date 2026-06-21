import { client } from "../tina/__generated__/client.ts";
import fs from "node:fs";
import path from "node:path";

async function main() {
    const result = await client.queries.productConnection();
    const products = (result.data.productConnection.edges ?? []).flatMap((edge: any) =>
        edge?.node ? [edge.node] : []
    );
    const materials = (result.data.materialConnection.edges ?? []).flatMap((edge: any) =>
        edge?.node ? [edge.node] : []
    );

    const delivery_options = (result.data.deliveryOptionConnection.edges ?? []).flatMap((edge: any) =>
        edge?.node ? [edge.node] : []
    );

    // Convert them to Record<string, any> and write to JSON files
    fs.writeFileSync(
        path.join(process.cwd(), "static/product-index.json"),
        JSON.stringify(
            products.reduce((acc: Record<string, any>, product: any) => {
                acc[product.product_id] = product;
                return acc;
            }, {}),
            null,
            2
        )
    );
    fs.writeFileSync(path.join(process.cwd(), "static/material-index.json"), JSON.stringify(materials, null, 2));
    fs.writeFileSync(
        path.join(process.cwd(), "static/delivery-option-index.json"),
        JSON.stringify(delivery_options, null, 2)
    );
}

main().catch((error) => {
    console.error("Failed to generate product index JSON from Tina:", error);
    process.exit(1);
});
