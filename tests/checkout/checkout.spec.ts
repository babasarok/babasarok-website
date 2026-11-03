import { expect, test, type Page } from "@playwright/test";
import { createProduct, withdrawLargeSize } from "./helpers";

let slug = "";

test.beforeAll(async () => {
  slug = await createProduct();
});

async function openProductInApp(page: Page): Promise<void> {
  await page.goto("/product/");
  await page
    .getByRole("link", { name: /E2E Párna/ })
    .first()
    .click();
  await expect(page.getByRole("button", { name: /Kosárba/ })).toBeVisible();
}

async function addLargeToBasket(page: Page): Promise<void> {
  await openProductInApp(page);
  await page.getByRole("button", { name: /50x50/ }).click();
  await page.getByRole("button", { name: /Kosárba|Kosár frissítése/ }).click();
  await expect(page.getByText("A termék a kosárban van.")).toBeVisible();
}

test("configured product goes from the product page through checkout to a placed order", async ({
  page,
}) => {
  await addLargeToBasket(page);
  await expect(page.locator("header").getByText("1", { exact: true }).first()).toBeVisible();

  await page.getByRole("link", { name: /Tovább a pénztárhoz/ }).click();
  await expect(page).toHaveURL(/\/checkout/);

  const line = page.getByTestId("checkout-line");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("50x50");
  await expect(line).toContainText(/11\s?000\s?Ft/);

  await page.getByPlaceholder("Név *").fill("Teszt Elek");
  await page.getByPlaceholder("Email cím *").fill("teszt@example.com");
  await page.getByLabel(/Személyes átvétel/).check();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Leadom a rendelést/ }).click();

  await expect(page.getByTestId("order-code")).toBeVisible();
  await expect(page.getByTestId("order-code")).not.toBeEmpty();

  await page.reload();
  await expect(page.getByText("A kosarad üres.")).toBeVisible();
});

test("a line whose option was withdrawn is marked and blocks the order until removed", async ({
  page,
}) => {
  await addLargeToBasket(page);
  await withdrawLargeSize();

  await page.goto("/checkout");

  const line = page.getByTestId("checkout-line");
  await expect
    .poll(
      async () => {
        await page.reload();
        return line.locator("p.text-danger-500").count();
      },
      { timeout: 90_000 }
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: /Leadom a rendelést/ })).toBeDisabled();

  await line.getByRole("button", { name: /Törlés/ }).click();
  await expect(page.getByText("A kosarad üres.")).toBeVisible();
  expect(slug).not.toBe("");
});
