/* Sample records: the browser's offline fallback, and the seed for an empty MongoDB database (server/index.js). */
export const INITIAL = {
  vehicles: [
    { id: "VH-2401", vin: "WBA7A1100MCE18421", reg: "VCA 4821", brand: "BMW", model: "330i M Sport", year: 2025, condition: "New", mileage: 0, cost: 198000, price: 238800, branch: "Kuala Lumpur", status: "Available", color: "Mineral White", location: "Showroom A" },
    { id: "VH-2402", vin: "JTDKBRFU0J3591028", reg: "VBD 2190", brand: "Toyota", model: "Corolla Cross Hybrid", year: 2025, condition: "New", mileage: 0, cost: 112000, price: 139800, branch: "Petaling Jaya", status: "Reserved", color: "Platinum White", location: "Showroom B" },
    { id: "VH-2403", vin: "WVWZZZCD8PW028341", reg: "VCE 7734", brand: "Volkswagen", model: "Golf GTI", year: 2024, condition: "Used", mileage: 12400, cost: 128000, price: 159800, branch: "Kuala Lumpur", status: "Available", color: "Kings Red", location: "Used Car Gallery" },
    { id: "VH-2404", vin: "MNTCB4D23Z0004281", reg: "VCF 1138", brand: "Nissan", model: "X-Trail e-POWER", year: 2025, condition: "New", mileage: 0, cost: 145000, price: 179800, branch: "Shah Alam", status: "In Transit", color: "Diamond Black", location: "Inbound" },
    { id: "VH-2405", vin: "MR0HA3CD8P0051432", reg: "VCH 8032", brand: "Toyota", model: "Hilux 2.8 Rogue", year: 2024, condition: "Used", mileage: 18300, cost: 132000, price: 154800, branch: "Petaling Jaya", status: "Under Inspection", color: "Attitude Black", location: "Workshop Bay 2" },
    { id: "VH-2406", vin: "WBA5R1107KAK77312", reg: "VCA 9902", brand: "BMW", model: "X3 xDrive30i", year: 2025, condition: "New", mileage: 0, cost: 245000, price: 289800, branch: "Kuala Lumpur", status: "Allocated", color: "Phytonic Blue", location: "Delivery Prep" },
  ],
  customers: [
    { id: "CU-1001", name: "Amelia Tan", type: "Individual", email: "amelia.tan@example.com", phone: "+60 12-345 6789", preferred: "BMW", owner: "Daniel Wong", branch: "Kuala Lumpur", spent: 238800, status: "Active" },
    { id: "CU-1002", name: "Meridian Tech Sdn Bhd", type: "Corporate", email: "procurement@meridiantech.my", phone: "+60 3-7788 2211", preferred: "Toyota", owner: "Sarah Lim", branch: "Petaling Jaya", spent: 419400, status: "Active" },
    { id: "CU-1003", name: "Marcus Lee", type: "Individual", email: "marcus.lee@example.com", phone: "+60 16-222 9011", preferred: "Volkswagen", owner: "Daniel Wong", branch: "Kuala Lumpur", spent: 159800, status: "Active" },
    { id: "CU-1004", name: "Pioneer Logistics", type: "Fleet", email: "fleet@pioneerlogistics.my", phone: "+60 3-5521 8200", preferred: "Nissan", owner: "Sarah Lim", branch: "Shah Alam", spent: 0, status: "Prospect" },
    { id: "CU-1005", name: "Nur Aisyah Rahman", type: "Individual", email: "aisyah.r@example.com", phone: "+60 19-455 3320", preferred: "Toyota", owner: "Kevin Goh", branch: "Petaling Jaya", spent: 154800, status: "Active" },
  ],
  sales: [
    { id: "SO-2026-1042", customer: "Amelia Tan", vehicle: "BMW 330i M Sport", amount: 238800, status: "Delivery Prep", payment: "Deposit Paid", consultant: "Daniel Wong", date: "2026-10-18" },
    { id: "SO-2026-1041", customer: "Meridian Tech Sdn Bhd", vehicle: "Toyota Corolla Cross Hybrid", amount: 139800, status: "Awaiting Payment", payment: "Pending", consultant: "Sarah Lim", date: "2026-10-17" },
    { id: "SO-2026-1038", customer: "Marcus Lee", vehicle: "Volkswagen Golf GTI", amount: 159800, status: "Completed", payment: "Paid", consultant: "Daniel Wong", date: "2026-10-14" },
    { id: "SO-2026-1035", customer: "Pioneer Logistics", vehicle: "Nissan X-Trail e-POWER", amount: 179800, status: "Quotation", payment: "Not Due", consultant: "Kevin Goh", date: "2026-10-12" },
  ],
  jobs: [
    { id: "RO-6218", customer: "Amelia Tan", vehicle: "BMW X3 xDrive30i", service: "1,000 km inspection", technician: "Arif Hassan", status: "In Progress", due: "2026-10-22", branch: "Kuala Lumpur" },
    { id: "RO-6217", customer: "Marcus Lee", vehicle: "Volkswagen Golf GTI", service: "Brake pad replacement", technician: "Kumar Raj", status: "Waiting for Parts", due: "2026-10-22", branch: "Kuala Lumpur" },
    { id: "RO-6216", customer: "Nur Aisyah Rahman", vehicle: "Toyota Hilux 2.8 Rogue", service: "Periodic maintenance", technician: "Arif Hassan", status: "Quality Check", due: "2026-10-23", branch: "Petaling Jaya" },
    { id: "RO-6214", customer: "Meridian Tech Sdn Bhd", vehicle: "Toyota Corolla Cross Hybrid", service: "Hybrid system diagnosis", technician: "Lim Wei Jian", status: "Awaiting Customer Approval", due: "2026-10-21", branch: "Petaling Jaya" },
  ],
  parts: [
    { id: "PT-00921", name: "Oil Filter — 2.0L", sku: "TOY-90915-YZZD3", brand: "Toyota", qty: 42, min: 20, cost: 18, price: 32, location: "A-02-04", supplier: "UMW Parts" },
    { id: "PT-00922", name: "Front Brake Pad Set", sku: "BMW-341168", brand: "BMW", qty: 8, min: 12, cost: 280, price: 420, location: "B-01-02", supplier: "Euro Auto Supply" },
    { id: "PT-00923", name: "Cabin Air Filter", sku: "VW-5Q0819653", brand: "Volkswagen", qty: 26, min: 10, cost: 45, price: 75, location: "A-03-01", supplier: "VAG Parts MY" },
    { id: "PT-00924", name: "Engine Air Filter", sku: "NIS-16546", brand: "Nissan", qty: 4, min: 8, cost: 68, price: 105, location: "C-01-05", supplier: "Tan Chong Parts" },
    { id: "PT-00925", name: "Synthetic Engine Oil 5W-30", sku: "OIL-5W30-4L", brand: "Multi-brand", qty: 63, min: 24, cost: 95, price: 138, location: "A-01-01", supplier: "PetroPro" },
  ],
  warranties: [
    { id: "WR-1201", customer: "Amelia Tan", vehicle: "BMW 330i M Sport", start: "2025-11-01", expiry: "2028-10-31", coverage: "Manufacturer — 3 years", status: "Active" },
    { id: "WR-1202", customer: "Marcus Lee", vehicle: "Volkswagen Golf GTI", start: "2024-06-14", expiry: "2027-06-13", coverage: "Manufacturer — 3 years", status: "Active" },
    { id: "WR-1203", customer: "Meridian Tech Sdn Bhd", vehicle: "Toyota Corolla Cross Hybrid", start: "2023-12-01", expiry: "2026-11-30", coverage: "Hybrid battery + vehicle", status: "Expiring Soon" },
  ],
};
