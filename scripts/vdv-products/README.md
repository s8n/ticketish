# VDV product name data

The `productids_*.json` files here are vendored from
[zuegli](https://github.com/TheEnbyperor/zuegli) (`main/vdv/data/products/`,
EUPL-1.2), where they were compiled from the published tariff data of the
respective German transport associations.

`productids_ticketish.json` is ours: entries identified from sample tickets
that the vendored data does not cover. Keep additions there rather than
editing the vendored files, so a refresh from upstream stays a clean copy.

Run `python scripts/build-vdv-products.py` to merge them all into
`src/lib/tickets/vdv/products.json`.
