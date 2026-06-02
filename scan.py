import asyncio
from bleak import BleakScanner

async def main():
    devs = await BleakScanner.discover(timeout=12.0, return_adv=True)
    rows = []
    for addr, (d, adv) in devs.items():
        rows.append((adv.rssi, addr, d.name, adv.local_name,
                     list(adv.service_uuids),
                     {k: v.hex() for k, v in adv.manufacturer_data.items()}))
    rows.sort(reverse=True)  # strongest signal first
    for rssi, addr, name, local, uuids, mfg in rows:
        print(f"{rssi:4d} dBm  {addr}  name={name}  local={local}")
        if uuids: print(f"            services={uuids}")
        if mfg:   print(f"            mfg={mfg}")

asyncio.run(main())

