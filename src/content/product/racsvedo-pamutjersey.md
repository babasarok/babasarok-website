---
name: Fonott rácsvédő (Pamutjersey)
product_id: racsvedo-pamutjersey
title: Fonott rácsvédő (Pamutjersey)
hidden_in_product_list: true
can_be_ordered: true
date: 2026-02-09T10:42:21.210Z
icon: /src/assets/product/braids.svg
priced_by_length: true
price: 0
materials:
  materials:
    - material_path: src/content/material/pamutjersey.md
      price: 0
      color_count: fonas
  material_required_count: 1
fields:
  - name: sizes
    length_based_pricing_source: true
    label: Méret
    type: radio
    items:
      - value: '200'
        label: 200cm
      - value: '260'
        label: 260cm
      - value: '300'
        label: 300cm
      - value: '340'
        label: 340cm
      - value: '380'
        label: 380cm
      - value: '400'
        label: 400cm
    allow_custom_value: true
    regex: ^(\d+)$
  - name: fonas
    label: Fonás
    type: radio
    items:
      - value: '3'
        label: Hármas
        price: 6400
      - value: '4'
        label: Négyes
        price: 8000
      - value: '5'
        label: Ötös
        price: 9500
        tooltip: Más néven halszálka.
      - value: '6'
        label: Hatos
        price: 12500
    regex: ^(\d+)$
---

