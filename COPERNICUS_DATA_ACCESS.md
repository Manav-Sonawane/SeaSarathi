# Copernicus Marine SST & Chlorophyll Data Access

## Scope

This document covers only current and historical Sea Surface Temperature
(SST) and Chlorophyll-a (CHL), plus Python access through the Copernicus
Marine Toolbox.

## 1. Recommended Dataset Stack

  ---------------------------------------------------------------------------------------------------------------------------------------------------------
  Data           Purpose          Product ID                                  Dataset ID                                                     Resolution
  -------------- ---------------- ------------------------------------------- -------------------------------------------------------------- --------------
  Current SST    Recent/current   `SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001`   `METOFFICE-GLO-SST-L4-NRT-OBS-SST-V2`                          0.05°
                 SST                                                                                                                         

  Historical SST Long-term SST /  `SST_GLO_SST_L4_REP_OBSERVATIONS_010_011`   `METOFFICE-GLO-SST-L4-REP-OBS-SST`                             0.05°
                 anomaly baseline                                                                                                            

  Current CHL    Recent           `OCEANCOLOUR_GLO_BGC_L4_NRT_009_102`        `cmems_obs-oc_glo_bgc-plankton_nrt_l4-gapfree-multi-4km_P1D`   4 km
                 chlorophyll                                                                                                                 

  Historical CHL Long-term        `OCEANCOLOUR_GLO_BGC_L4_MY_009_104`         `cmems_obs-oc_glo_bgc-plankton_my_l4-gapfree-multi-4km_P1D`    4 km
                 chlorophyll                                                                                                                 
  ---------------------------------------------------------------------------------------------------------------------------------------------------------

### Primary variables

SST:

``` text
analysed_sst
```

CHL:

``` text
CHL
```

CHL is chlorophyll-a concentration in seawater, in mg m-3.

------------------------------------------------------------------------

## 2. Current SST

**Product ID**

``` text
SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001
```

**Dataset ID**

``` text
METOFFICE-GLO-SST-L4-NRT-OBS-SST-V2
```

Use for current/recent SST maps and analysis.

Official product page:

https://data.marine.copernicus.eu/product/SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001/services

------------------------------------------------------------------------

## 3. Historical SST

**Product ID**

``` text
SST_GLO_SST_L4_REP_OBSERVATIONS_010_011
```

**Dataset ID**

``` text
METOFFICE-GLO-SST-L4-REP-OBS-SST
```

The reprocessed OSTIA product is daily, Level 4, 0.05° × 0.05°, and
provides a long historical record beginning 1 October 1981.

Use for:

-   SST anomaly
-   Seasonal baselines
-   Historical comparison
-   Long-term analysis

Official product page:

https://data.marine.copernicus.eu/product/SST_GLO_SST_L4_REP_OBSERVATIONS_010_011/services

------------------------------------------------------------------------

## 4. Current CHL

**Product ID**

``` text
OCEANCOLOUR_GLO_BGC_L4_NRT_009_102
```

**Dataset ID**

``` text
cmems_obs-oc_glo_bgc-plankton_nrt_l4-gapfree-multi-4km_P1D
```

**Variable**

``` text
CHL
```

This is the daily 4 km multi-sensor Level 4 gap-free product.

Use for:

-   Current CHL map
-   Recent biological conditions
-   SST + CHL overlay
-   Current PFZ analysis

Official product page:

https://data.marine.copernicus.eu/product/OCEANCOLOUR_GLO_BGC_L4_NRT_009_102/services

------------------------------------------------------------------------

## 5. Historical CHL

**Product ID**

``` text
OCEANCOLOUR_GLO_BGC_L4_MY_009_104
```

**Dataset ID**

``` text
cmems_obs-oc_glo_bgc-plankton_my_l4-gapfree-multi-4km_P1D
```

**Variable**

``` text
CHL
```

This is the daily 4 km multi-sensor Level 4 gap-free historical product.
The current catalogue lists coverage from September 1997 onward.

Use for:

-   Historical CHL
-   Seasonal baselines
-   CHL anomaly
-   PFZ model training
-   Historical SST/CHL correlation

Official product page:

https://data.marine.copernicus.eu/product/OCEANCOLOUR_GLO_BGC_L4_MY_009_104/services

------------------------------------------------------------------------

## 6. Historical L3 CHL Alternative

There is also a historical Level 3 daily multi-sensor CHL dataset:

**Product ID**

``` text
OCEANCOLOUR_GLO_BGC_L3_MY_009_103
```

**Dataset ID**

``` text
cmems_obs-oc_glo_bgc-plankton_my_l3-multi-4km_P1D
```

It provides daily 4 km multi-sensor observations from 1997 onward.

Use L3 when raw/less-interpolated satellite observations are
specifically required.

For the main application pipeline, prefer the L4 gap-free historical
product because it provides a continuous daily field.

Official product page:

https://data.marine.copernicus.eu/product/OCEANCOLOUR_GLO_BGC_L3_MY_009_103/services

------------------------------------------------------------------------

## 7. Current vs Historical Architecture

``` text
SST
 |
 +-- Current
 |     `-- OSTIA NRT
 |
 `-- Historical
       `-- OSTIA Reprocessed


CHL
 |
 +-- Current
 |     `-- GlobColour NRT L4 gap-free
 |
 `-- Historical
       `-- GlobColour Multi-Year L4 gap-free
```

The current datasets are used for the present-state map.

The historical datasets are used to establish baselines, anomalies and
training/analytics data.

------------------------------------------------------------------------

# 8. Copernicus Marine Python Toolbox

Install:

``` bash
pip install copernicusmarine
```

The Python API provides:

-   `open_dataset()` for remote/lazy Xarray access
-   `read_dataframe()` for direct Pandas access
-   `subset()` for downloading selected data
-   `get()` for original producer files

For this project, the main functions are:

``` text
open_dataset()
read_dataframe()
subset()
```

------------------------------------------------------------------------

# 9. Credentials

Use these environment variables:

``` env
COPERNICUSMARINE_SERVICE_USERNAME=your_username
COPERNICUSMARINE_SERVICE_PASSWORD=your_password
```

Do not put credentials directly in Python code or commit them to Git.

The Toolbox automatically checks these environment variables when
credentials are not passed explicitly.

Optional one-time login:

``` bash
copernicusmarine login
```

or:

``` python
import copernicusmarine

copernicusmarine.login()
```

------------------------------------------------------------------------

# 10. Method A: Remote Xarray Access

`open_dataset()` is the preferred method for large gridded SST/CHL data
because it uses lazy loading.

Example:

``` python
import copernicusmarine

ds = copernicusmarine.open_dataset(
    dataset_id="METOFFICE-GLO-SST-L4-REP-OBS-SST",
    variables=["analysed_sst"],
    minimum_longitude=65,
    maximum_longitude=100,
    minimum_latitude=4,
    maximum_latitude=25,
    start_datetime="2025-01-01",
    end_datetime="2025-01-31"
)

print(ds)
```

Current SST:

``` python
ds = copernicusmarine.open_dataset(
    dataset_id="METOFFICE-GLO-SST-L4-NRT-OBS-SST-V2",
    variables=["analysed_sst"],
    minimum_longitude=65,
    maximum_longitude=100,
    minimum_latitude=4,
    maximum_latitude=25,
    start_datetime="2026-09-01",
    end_datetime="2026-09-03"
)
```

Current CHL:

``` python
ds = copernicusmarine.open_dataset(
    dataset_id="cmems_obs-oc_glo_bgc-plankton_nrt_l4-gapfree-multi-4km_P1D",
    variables=["CHL"],
    minimum_longitude=65,
    maximum_longitude=100,
    minimum_latitude=4,
    maximum_latitude=25,
    start_datetime="2026-09-01",
    end_datetime="2026-09-03"
)
```

Historical CHL:

``` python
ds = copernicusmarine.open_dataset(
    dataset_id="cmems_obs-oc_glo_bgc-plankton_my_l4-gapfree-multi-4km_P1D",
    variables=["CHL"],
    minimum_longitude=65,
    maximum_longitude=100,
    minimum_latitude=4,
    maximum_latitude=25,
    start_datetime="2020-01-01",
    end_datetime="2020-01-31"
)
```

If a Pandas table is actually required:

``` python
df = ds.to_dataframe().reset_index()
```

Do not convert huge India-wide multi-year rasters to DataFrames
unnecessarily.

------------------------------------------------------------------------

# 11. Method B: Direct Pandas with `read_dataframe()`

Use this for small areas, point queries and short time-series requests.

Example:

``` python
import copernicusmarine

df = copernicusmarine.read_dataframe(
    dataset_id="METOFFICE-GLO-SST-L4-REP-OBS-SST",
    variables=["analysed_sst"],
    minimum_longitude=72.0,
    maximum_longitude=73.0,
    minimum_latitude=18.0,
    maximum_latitude=19.0,
    start_datetime="2025-01-01",
    end_datetime="2025-01-07"
)

print(df.head())
```

CHL:

``` python
df = copernicusmarine.read_dataframe(
    dataset_id="cmems_obs-oc_glo_bgc-plankton_my_l4-gapfree-multi-4km_P1D",
    variables=["CHL"],
    minimum_longitude=72.0,
    maximum_longitude=73.0,
    minimum_latitude=18.0,
    maximum_latitude=19.0,
    start_datetime="2020-01-01",
    end_datetime="2020-01-07"
)

print(df.head())
```

------------------------------------------------------------------------

# 12. Method C: Download a Subset

Use `subset()` when local files are required for training, caching or
offline analysis.

Example:

``` python
import copernicusmarine

copernicusmarine.subset(
    dataset_id="METOFFICE-GLO-SST-L4-REP-OBS-SST",
    variables=["analysed_sst"],
    minimum_longitude=65,
    maximum_longitude=100,
    minimum_latitude=4,
    maximum_latitude=25,
    start_datetime="2025-01-01",
    end_datetime="2025-01-31",
    output_directory="./data/sst/historical"
)
```

Historical CHL:

``` python
copernicusmarine.subset(
    dataset_id="cmems_obs-oc_glo_bgc-plankton_my_l4-gapfree-multi-4km_P1D",
    variables=["CHL"],
    minimum_longitude=65,
    maximum_longitude=100,
    minimum_latitude=4,
    maximum_latitude=25,
    start_datetime="2025-01-01",
    end_datetime="2025-01-31",
    output_directory="./data/chl/historical"
)
```

Do not download the entire global historical products.

------------------------------------------------------------------------

# 13. India Project Region

Initially use:

``` text
Latitude:  4°N to 25°N
Longitude: 65°E to 100°E
```

Then apply the existing India EEZ geometry to restrict the final working
region.

``` text
Global Copernicus dataset
        |
        v
65E–100E / 4N–25N
        |
        v
India EEZ
        |
        v
Project SST / CHL data
```

------------------------------------------------------------------------

# 14. SST and CHL Baseline Analysis

## SST anomaly

``` text
Current SST - Historical SST baseline = SST anomaly
```

The historical baseline should preferably be seasonal/monthly rather
than one global mean.

Example:

``` python
sst_anomaly = current_sst - historical_mean
```

## CHL anomaly

``` text
Current CHL - Historical CHL baseline = CHL anomaly
```

CHL distributions can be strongly skewed, so logarithmic analysis may be
useful depending on the ML/statistical method.

------------------------------------------------------------------------

# 15. Storage Strategy

Prefer:

``` text
NetCDF
Zarr
Xarray Dataset
```

Use Pandas for small tabular extracts.

Suggested structure:

``` text
data/
├── sst/
│   ├── current/
│   └── historical/
│
└── chl/
    ├── current/
    └── historical/
```

------------------------------------------------------------------------

# 16. Final Decision

### SST

``` text
CURRENT
Product:
SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001

Dataset:
METOFFICE-GLO-SST-L4-NRT-OBS-SST-V2


HISTORICAL
Product:
SST_GLO_SST_L4_REP_OBSERVATIONS_010_011

Dataset:
METOFFICE-GLO-SST-L4-REP-OBS-SST
```

### CHL

``` text
CURRENT
Product:
OCEANCOLOUR_GLO_BGC_L4_NRT_009_102

Dataset:
cmems_obs-oc_glo_bgc-plankton_nrt_l4-gapfree-multi-4km_P1D


HISTORICAL
Product:
OCEANCOLOUR_GLO_BGC_L4_MY_009_104

Dataset:
cmems_obs-oc_glo_bgc-plankton_my_l4-gapfree-multi-4km_P1D
```

### Access strategy

``` text
Large gridded remote analysis
        -> open_dataset()

Small point/area/time-series query
        -> read_dataframe()

Training/offline/local subset
        -> subset()
```

The application should not download complete global products
unnecessarily.

------------------------------------------------------------------------

# 17. Official References

Copernicus Marine Toolbox remote dataset/DataFrame API:

https://help.marine.copernicus.eu/en/articles/8287609-copernicus-marine-toolbox-api-open-a-dataset-or-read-a-dataframe-remotely

Copernicus Marine credentials:

https://help.marine.copernicus.eu/en/articles/8185007-copernicus-marine-toolbox-credentials-configuration

Current SST:

https://data.marine.copernicus.eu/product/SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001/services

Historical SST:

https://data.marine.copernicus.eu/product/SST_GLO_SST_L4_REP_OBSERVATIONS_010_011/services

Current CHL:

https://data.marine.copernicus.eu/product/OCEANCOLOUR_GLO_BGC_L4_NRT_009_102/services

Historical CHL:

https://data.marine.copernicus.eu/product/OCEANCOLOUR_GLO_BGC_L4_MY_009_104/services

Historical L3 CHL alternative:

https://data.marine.copernicus.eu/product/OCEANCOLOUR_GLO_BGC_L3_MY_009_103/services
