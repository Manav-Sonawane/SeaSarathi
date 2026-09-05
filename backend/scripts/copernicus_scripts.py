import copernicusmarine

# CHLOROPHYLL SCRIPT
def download_chlorophyll():
    print("Downloading Chlorophyll data...")
    copernicusmarine.subset(
        dataset_id="cmems_mod_glo_bgc-pft_anfc_0.25deg_P1D-m",
        dataset_version="202311",
        variables=["chl"],
        minimum_longitude=-180,
        maximum_longitude=179.75,
        minimum_latitude=-80,
        maximum_latitude=90,
        start_datetime="2026-09-13T00:00:00",
        end_datetime="2026-09-13T00:00:00",
        minimum_depth=0.4940253794193268,
        maximum_depth=0.4940253794193268,
        coordinates_selection_method="strict-inside",
        netcdf_compression_level=1,
        disable_progress_bar=True,
    )

# SST SCRIPT
def download_sst():
    print("Downloading SST data...")
    copernicusmarine.subset(
        dataset_id="METOFFICE-GLO-SST-L4-NRT-OBS-SST-V2",
        variables=["analysed_sst"],
        minimum_longitude=-179.97500610351562,
        maximum_longitude=179.97500610351562,
        minimum_latitude=-89.9749984741211,
        maximum_latitude=89.9749984741211,
        start_datetime="2026-09-02T00:00:00",
        end_datetime="2026-09-02T00:00:00",
        coordinates_selection_method="strict-inside",
        netcdf_compression_level=1,
        disable_progress_bar=True,
    )

if __name__ == "__main__":
    download_chlorophyll()
    download_sst()
