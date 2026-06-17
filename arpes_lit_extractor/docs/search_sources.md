# Literature and Materials Search Sources

This project should distinguish source type clearly:

- `official_api`: good candidate for automatic metadata search.
- `export_or_paid_api`: import exported files first; API needs institutional access.
- `manual_bibtex_import`: useful manually, but not safe to scrape.
- `materials_database`: useful for material properties, not a replacement for experimental ARPES literature.

Recommended integration order:

1. OpenAlex, Crossref, arXiv: open metadata search and DOI normalization.
2. Web of Science export: curated lab/institution article sets.
3. Google Scholar BibTeX: broad manual discovery, no automated scraping.
4. Semantic Scholar: citation/reference enrichment.
5. Materials Project and OPTIMADE: computed/structural material context.
6. Scopus/Dimensions: only if the lab has API or export access.

Data policy:

- Element data and database metadata can be displayed with source labels.
- Article-level experimental values such as temperature, photon energy, band gap, and Fermi velocity must remain blank or marked as `metadata_only` until verified from full text or lab data.
- Google Scholar should be used via manual BibTeX export only.
