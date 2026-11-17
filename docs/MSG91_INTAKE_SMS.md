# MSG91 intake acknowledgement SMS

After a patient submits `/intake`, the API sends a utility SMS with their patient number.

## Exact DLT content (register this first)

**Category:** Service Implicit / Utility  
**Sender / Header:** `AHIMSA` (6 letters, must match DLT header)  
**Language:** English  

**DLT template body** (operators use `{#var#}`):

```
Dear {#var#}, your case sheet is registered at Ahimsa Wellness Centre, Gurugram. Patient No: {#var#}. Please show this at the front desk. - Ahimsa
```

Var 1 = patient first name · Var 2 = patient number (e.g. `AWC-CS-2026-0001`)

## MSG91 template (after DLT approval)

1. SMS → Templates → Create  
2. Name: `Intake Case Sheet Ack`  
3. Sender ID: `AHIMSA`  
4. DLT Template ID: paste the approved ID from the DLT portal  
5. SMS content (MSG91 variables use `##name##`):

```
Dear ##name##, your case sheet is registered at Ahimsa Wellness Centre, Gurugram. Patient No: ##patientno##. Please show this at the front desk. - Ahimsa
```

6. Wait until status is **Verified by DLT** · Mark default  
7. Copy MSG91 Template / Flow ID into env

## Environment (Railway)

```
MSG91_AUTH_KEY=...
MSG91_FLOW_ID=...
MSG91_SENDER_ID=AHIMSA
```

Auth key: MSG91 → profile / API → Authkey.

## India DLT prerequisites (cannot skip)

1. Register the **business entity** on one DLT portal (Jio / Airtel / Vi / BSNL)  
2. Note the **PE ID**  
3. Register header `AHIMSA` and the content template above  
4. Whitelist MSG91 as Telemarketer (PE–TM binding)  
5. Then add Sender ID + PE ID on MSG91 and map the template

Without PE ID + approved DLT template ID, Indian SMS will not deliver.
