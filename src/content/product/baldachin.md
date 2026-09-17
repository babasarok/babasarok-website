---
product_id: baldachin
title: Baldachin
can_be_ordered: true
categories: A babaszoba stílusos kiegészítője
date: 2024-02-02T06:49:27.000Z
thumbnail: /src/assets/Noémi-51.webp
images:
  - image: /src/assets/IMG_6918.jpeg
  - image: /src/assets/IMG_7836.jpeg
  - image: /src/assets/IMG_3228.jpeg
  - image: /src/assets/IMG_7894.jpeg
table:
  - title: 9m sűrűségű
    description: 17000Ft
  - title: 12m sűrűségű
    description: 21000Ft
shortDescription: 'A finom, puha tüllből készült baldachin eleganciát és modern vonalat csempész a babaszobába.'
price: 17000
materials:
  material_required_count: 0
fields:
  - name: szin
    label: Szín
    type: color
    allow_custom_value: true
  - name: suruseg
    label: Sűrűség
    type: radio
    items:
      - value: '6'
        label: 6m
      - value: '9'
        label: 9m
        price: 2000
      - value: '12'
        label: 12m
        price: 6000
  - name: 'Ajandek '
    label: Ajándék masni
    type: toggle
    price: 0
    depends_on:
      field: Ajandek
  - name: Ajandek
    label: Ajándék pompom
    type: toggle
    price: 0
    depends_on:
      field: 'Ajandek '
---

Ajándék pompommal, vagy masnival
