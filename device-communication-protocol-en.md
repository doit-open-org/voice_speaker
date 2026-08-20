# Mini Program-to-Device BLE Communication Protocol

[Chinese](./device-communication-protocol.md) | English

This document is derived from the current mini program source code. It describes the data sent to the device over BLE and the device responses that the mini program currently parses. It documents the implementation as it exists; it is not an independent, authoritative firmware protocol specification. Fields that cannot be determined from the source code are explicitly marked as requiring firmware confirmation.

Compiled: 2026-08-20

## 1. Protocol Layers

Data sent by the mini program has two layers:

```text
Command packet (CMD + LEN + DATA)
        |
BLE transport frame (VER + SEQ + LEN + command fragment + CRC8)
        |
GATT Write Characteristic
```

Device notifications follow the reverse path. The mini program first validates and removes the BLE transport frame, reassembles the command packet, and then passes it to the current page for processing.

Unless a field description explicitly states otherwise, all multi-byte integers in this document are transmitted in big-endian order, with the most significant byte first.

## 2. BLE GATT Parameters

| Purpose | UUID |
| --- | --- |
| Service | `00001910-0000-1000-8000-00805F9B34FB` |
| Mini program writes to device | `00002B12-0000-1000-8000-00805F9B34FB` |
| Device notifies mini program | `00002B10-0000-1000-8000-00805F9B34FB` |

After a connection is established and notifications are enabled, the mini program immediately performs the `CMD 0x00` handshake. The current connection flow does not call `wx.setBLEMTU`. Instead, the mini program reads the device MTU from the final two bytes of the `CMD 0x00` response and subtracts the 3-byte ATT header to obtain the writable length `M` used by the remaining code.

```text
M = MTU returned by the device - 3
```

Before a device MTU is received, the default value of `M` is `509`, which is `512 - 3`.

## 3. BLE Transport Frame

### 3.1 Active `0x04` Frame

Before being written to GATT, each command packet is split into one or more transport frames with the following format:

| Offset | Length | Field | Description |
| ---: | ---: | --- | --- |
| 0 | 1 | `VER` | Fixed at `0x04` |
| 1 | 2 | `SEQ` | Big-endian; bit 15 marks the final frame, and bits 0-14 contain the frame sequence number starting at 0 |
| 3 | 2 | `DATA_LEN` | Number of bytes in this frame's `DATA`, big-endian |
| 5 | N | `DATA` | A fragment of the command packet |
| 5+N | 1 | `CRC8` | CRC8 from `VER` through the final byte of `DATA` |

The maximum command data length in one transport frame is:

```text
MAX_DATA_LEN = M - 6
```

The 6 bytes are `VER(1) + SEQ(2) + DATA_LEN(2) + CRC8(1)`.

The final frame is marked with `SEQ |= 0x8000`. When the first frame is also the final frame, for example, `SEQ` is `0x8000`, represented on the wire as `80 00`.

For example, the command packet for querying the track list is `0D 00 00`. Its complete single transport frame is:

```text
04 80 00 00 03 0D 00 00 6D
|  |---| |---| |------|  |
VER SEQ   LEN    DATA   CRC8
```

The send queue writes one transport frame every 30 ms. The current transport layer does not add acknowledgements, timeout retries, or a sliding window.

### 3.2 CRC8

CRC8 parameters:

| Parameter | Value |
| --- | --- |
| Polynomial | `0x07` |
| Initial value | `0x00` |
| Input reflection | No |
| Output XOR | `0x00` |
| Coverage | Every byte of the current transport frame except the trailing CRC8 byte |

This parameter set is equivalent to the commonly used CRC-8/SMBUS parameters. The source code uses a 256-entry lookup table.

### 3.3 Receive Reassembly Behavior

Device responses must also use the `0x04` transport frame described above. The current mini program processes them as follows:

1. Validate the CRC8 of each transport frame. Discard the frame if validation fails.
2. Append all bytes from offset 5 through the byte before CRC8 to the global receive buffer.
3. When bit 7 of the high byte of `SEQ` is set, pass the buffer to the page as one complete command packet.
4. Clear the receive buffer and wait for the next command packet.

The current code does not validate `VER`, `DATA_LEN`, or transport-frame sequence continuity.

## 4. Common Command Packet Format

Active command packets generally use this header:

| Offset | Length | Field | Description |
| ---: | ---: | --- | --- |
| 0 | 1 | `CMD` | Command ID |
| 1 | 2 | `LEN` | Length of `DATA`, big-endian |
| 3 | N | `DATA` | Command data |

A parameterless query is therefore 3 bytes. For example, the track-list query is `0D 00 00`, and the capacity query is `11 00 00`.

Command summary:

| CMD | Direction | Purpose | Current Status |
| --- | --- | --- | --- |
| `0x00` | Mini program -> device | Connection handshake, time synchronization, and device information/MTU query | Active |
| `0x01` | Mini program -> device | Provisioning/binding initialization (source-code naming) | Active |
| `0x02` | Mini program -> device | Generic attribute query | Implemented, not called by current pages |
| `0x03` | Mini program -> device | Generic attribute update | Implemented, not called by current pages |
| `0x04` | Mini program -> device | Unbind | Active |
| `0x0A` | Mini program -> device | Declare a file for transfer | Active |
| `0x0B` | Bidirectional | Device requests a file block; mini program sends file data | Active |
| `0x0C` | Device -> mini program | Final file-transfer result | Active |
| `0x0D` | Bidirectional | Query/return device track list | Active |
| `0x0E` | Bidirectional | Delete a track and return the result | Active |
| `0x0F` | Bidirectional | Play a track and return the result | Active |
| `0x10` | Bidirectional | Rename a track and return the result | Active |
| `0x11` | Bidirectional | Query/return device capacity | Active |

## 5. Connection and Device Management Commands

### 5.1 `CMD 0x00`: Handshake and MTU Query

Mini program request:

| Offset | Length | Field | Description |
| ---: | ---: | --- | --- |
| 0 | 1 | `CMD` | `0x00` |
| 1 | 2 | `LEN` | `0x0004` |
| 3 | 4 | `TIMESTAMP` | Current Unix timestamp in seconds; exceptionally encoded as little-endian |

```text
00 00 04 <timestamp_le_u32>
```

For example, when the timestamp value is `0x12345678`, the command packet is:

```text
00 00 04 78 56 34 12
```

The complete device response format is not defined in the mini program. The current code only reads the final 2 bytes as a big-endian ATT MTU:

```text
device_mtu = (second-to-last byte << 8) | last byte
M = device_mtu - 3
```

After receiving `CMD 0x00`, the mini program immediately sends `CMD 0x01`.

### 5.2 `CMD 0x01`: Provisioning/Binding Initialization

The command packet currently sent is always 156 bytes:

| Command Offset | Length | Content |
| ---: | ---: | --- |
| 0 | 1 | `CMD = 0x01` |
| 1 | 2 | `LEN = 0x0099` (153) |
| 3 | 102 | All `0x00` |
| 105 | 10 | ASCII bytes of the fixed Device Key |
| 115 | 41 | All `0x00` |

The current Device Key is the fixed string:

```text
8910199948
```

Its bytes are:

```text
38 39 31 30 31 39 39 39 34 38
```

The internal meanings of the 102-byte and 41-byte reserved regions cannot be determined from the mini program source and require confirmation against the firmware protocol. The mini program marks the device as connected after receiving any `CMD 0x01` response; it does not inspect a status field.

### 5.3 `CMD 0x04`: Unbind

The request is fixed:

```text
04 00 01 01
```

| Offset | Length | Field | Value |
| ---: | ---: | --- | --- |
| 0 | 1 | `CMD` | `0x04` |
| 1 | 2 | `LEN` | `0x0001` |
| 3 | 1 | `ACTION` | `0x01` |

After sending the request, the mini program immediately clears its local device cache and connection display without waiting for a `CMD 0x04` response.

## 6. File Transfer Protocol

### 6.1 File Name Encoding

File names in `CMD 0x0A` and `CMD 0x10` use this encoding:

1. Prefix the value with ASCII `\U`, represented as `5C 55`.
2. Write each UTF-16 code unit in the JavaScript string as 2 bytes in little-endian order.

For example, `A.mp3` is encoded as:

```text
5C 55 41 00 2E 00 6D 00 70 00 33 00
```

This is not UTF-8. Characters represented by surrogate pairs are encoded as two separate UTF-16 code units.

### 6.2 File CRC16

The complete-file CRC and file-block CRC use the same CRC16 algorithm:

| Parameter | Value |
| --- | --- |
| Polynomial (reflected form) | `0xA001` |
| Initial value | `0x0000` |
| Input/output | Byte-by-byte, least-significant-bit-first lookup algorithm |
| Output XOR | `0x0000` |
| Wire byte order | The calculated value is written as a big-endian `uint16` |

Note that the initial value is `0x0000`, not the `0xFFFF` commonly used by Modbus.

### 6.3 `CMD 0x0A`: Declare File

| Offset | Length | Field | Description |
| ---: | ---: | --- | --- |
| 0 | 1 | `CMD` | `0x0A` |
| 1 | 2 | `LEN` | `6 + FILE_NAME_LEN` |
| 3 | 4 | `FILE_SIZE` | Complete audio file size in bytes, big-endian |
| 7 | 2 | `FILE_CRC` | CRC16 of the complete audio file, big-endian |
| 9 | N | `FILE_NAME` | `\U + UTF-16LE` encoding described above |

Based on how the current page reads the response, the expected success response is:

```text
0A 00 01 <status>
```

The mini program only defines `status = 0` as success. Every nonzero value is handled as a failure to send the file metadata.

### 6.4 `CMD 0x0B`: Device Requests a File Block

The device requests the next file block through a notification:

| Offset | Length | Field | Description |
| ---: | ---: | --- | --- |
| 0 | 1 | `CMD` | `0x0B` |
| 1 | 2 | `LEN` | Expected to be `0x0008`; the current code does not validate it |
| 3 | 4 | `OFFSET` | Byte offset from the start of the file, big-endian |
| 7 | 4 | `CHUNK_SIZE` | Requested block size, big-endian |

The mini program sends this actual amount:

```text
actual_chunk_size = min(CHUNK_SIZE, FILE_SIZE - OFFSET)
```

### 6.5 `CMD 0x0B`: Mini Program Sends File Data

The block requested by the device is further split into multiple command packets. The low 14-bit sequence number restarts at 0 for each new block request.

| Offset | Length | Field | Description |
| ---: | ---: | --- | --- |
| 0 | 1 | `CMD` | `0x0B` |
| 1 | 2 | `LEN` | `2 + optional BLOCK_CRC(2) + DATA_LEN` |
| 3 | 2 | `FILE_SEQ` | Big-endian, containing the sequence number and end flags |
| 5 | 2 | `BLOCK_CRC` | Present only in the first packet, where the low 14-bit sequence number is 0 |
| 5 or 7 | N | `DATA` | Raw audio bytes |

`FILE_SEQ` bit definitions:

| Bit | Name | Description |
| ---: | --- | --- |
| 15 | `FILE_END` | Set when the current packet is also the final packet of the entire file |
| 14 | `BLOCK_END` | Set when the current packet is the final packet of the requested block |
| 13..0 | `SEQ` | Packet sequence number within the current requested block, starting at 0 |

The first packet's `BLOCK_CRC` is calculated over the complete block requested by the device, not only the data in the first packet.

To reserve 6 bytes for the outer `0x04` frame, the mini program limits each `CMD 0x0B` command packet to `M - 6` bytes. Therefore:

```text
Maximum audio data in the first command packet = M - 13
Maximum audio data in later command packets     = M - 11
```

When `M = 509`, the first packet carries at most 496 bytes of audio data, and each later packet carries at most 498 bytes.

### 6.6 `CMD 0x0C`: File Transfer Result

Based on how the current page reads the response, the device is expected to respond after processing the complete file with:

```text
0C 00 01 <status>
```

The mini program only distinguishes:

| `status` | Handling |
| --- | --- |
| `0x00` | Transfer succeeded |
| Nonzero | Transfer failed |

Source comments mention these failure reasons but provide no numeric mapping: App-initiated cancellation, device-initiated cancellation, write failure, data out of range, complete-file CRC error, block CRC error, and sequence error. The firmware protocol must supply the specific status codes.

### 6.7 File Transfer Sequence

```text
Mini program                            Device
  |                                      |
  |-- CMD 0x0A size/CRC/name ----------->|
  |<------------- CMD 0x0A status -------|
  |<-- CMD 0x0B offset + chunk_size -----|
  |-- CMD 0x0B seq=0 + block CRC/data -->|
  |-- CMD 0x0B seq=1... + data --------->|
  |-- CMD 0x0B BLOCK_END + data -------->|
  |<-- CMD 0x0B next offset/chunk_size --|
  |                  ...                  |
  |-- CMD 0x0B FILE_END|BLOCK_END ------>|
  |<------------- CMD 0x0C status -------|
```

The device controls the block offset and size; the mini program does not proactively stream fixed 10 KiB blocks. Source comments use 10240 as a common `CHUNK_SIZE` example, but the code accepts any 32-bit value supplied by the device.

## 7. Device Track Management Commands

### 7.1 `CMD 0x0D`: Query Track List

Request:

```text
0D 00 00
```

The device response command header is:

```text
0D <len_be_u16> <one or more track records>
```

The current parser implies this format for each track record:

| Record Offset | Length | Field | Description |
| ---: | ---: | --- | --- |
| 0 | 1 | `ITEM_LEN` | Total byte length of the current record, including this field |
| 1 | 2 | `FILE_INDEX` | Big-endian |
| 3 | 4 | `FILE_SIZE` | Big-endian |
| 7 | 1 | `NAME_TYPE` | `0x01` for Chinese/mixed Chinese and English, `0x02` for English only |
| 8 | N | `FILE_NAME` | Name data |

The current page actually decodes the name data as follows:

- `NAME_TYPE = 0x01`: interpret each 2-byte group as one `uint16` character unit, then concatenate the character units in reverse order.
- Other values, including `0x02`: convert each byte to a character, then concatenate all bytes in reverse order.

The byte order of name responses and whether they contain the `\U` prefix cannot be determined from the mini program alone. Confirm these details using real device responses.

### 7.2 `CMD 0x0E`: Delete Track

Request:

| Offset | Length | Field |
| ---: | ---: | --- |
| 0 | 1 | `CMD = 0x0E` |
| 1 | 2 | `LEN = 0x0002` |
| 3 | 2 | `FILE_INDEX`, big-endian |

For example, to delete index 2:

```text
0E 00 02 00 02
```

The expected device response is `0E 00 01 <status>`; `0` means success and a nonzero value means failure.

### 7.3 `CMD 0x0F`: Play Track

The format is the same as the delete command, with the command ID changed to `0x0F`:

```text
0F 00 02 <file_index_be_u16>
```

The expected device response is `0F 00 01 <status>`. The current page only displays a playback failure when the status is nonzero.

### 7.4 `CMD 0x10`: Rename Track

| Offset | Length | Field | Description |
| ---: | ---: | --- | --- |
| 0 | 1 | `CMD` | `0x10` |
| 1 | 2 | `LEN` | `2 + OLD_NAME_LEN + NEW_NAME_LEN` |
| 3 | 1 | `OLD_NAME_LEN` | Encoded byte length of the old name |
| 4 | 1 | `NEW_NAME_LEN` | Encoded byte length of the new name |
| 5 | N | `OLD_NAME` | `\U + UTF-16LE` |
| 5+N | M | `NEW_NAME` | `\U + UTF-16LE` |

Each name length field is only 1 byte. The current code does not check whether an encoded name exceeds 255 bytes before sending it.

The expected device response is `10 00 01 <status>`; `0` means success and a nonzero value means failure.

### 7.5 `CMD 0x11`: Query Capacity

Request:

```text
11 00 00
```

Based on how the current page reads it, the device response is:

| Offset | Length | Field | Description |
| ---: | ---: | --- | --- |
| 0 | 1 | `CMD = 0x11` | |
| 1 | 2 | `LEN` | Expected to be `0x0008`; the current code does not validate it |
| 3 | 4 | `TOTAL_CAPACITY` | Total capacity, big-endian |
| 7 | 4 | `FREE_CAPACITY` | Free capacity, big-endian |

The page calculates utilization as:

```text
used_percent = round((TOTAL_CAPACITY - FREE_CAPACITY) / TOTAL_CAPACITY * 100)
```

## 8. Generic Attribute Commands (Currently Unused)

`hextool.js` retains builders for `CMD 0x02` and `CMD 0x03`, but no page in the repository calls them. They do not use the common 2-byte `LEN` header used by current command packets. Confirm them against the firmware before integrating them.

### 8.1 `CMD 0x02`: Query Attributes

```text
02 <attr_count_u8> <attr_id_1_u8> ... <attr_id_n_u8>
```

### 8.2 `CMD 0x03`: Update Attributes

Each attribute is appended as a separate segment:

```text
03 <1 + value_len> <attr_id_u8> <value>
```

Numeric values below 256 are encoded in 1 byte. Larger numeric values are encoded as 2-byte little-endian values. String values are treated as delimiter-free hexadecimal strings and converted to bytes.

## 9. Legacy 20-Byte Transport Frame (Currently Disabled)

The source retains the legacy `bleDatasFix` framing function, but `sendDatas` now calls the new `0x04` framing function unconditionally. The following format is not emitted by the current version:

| Offset | Length | Field | Description |
| ---: | ---: | --- | --- |
| 0 | 1 | `VER` | `0x01` |
| 1 | 1 | `SEQ` | Bit 7 marks the final packet; the low 7 bits contain the sequence number |
| 2 | 17 | `DATA` | Padded with `0x00` when shorter than 17 bytes |
| 19 | 1 | `CRC8` | Covers the preceding 19 bytes |

Legacy `CMD 0x01` implementations with a 1-byte length field and 153/163-byte variants also remain in the source but are not used by current pages. The legacy framing code fails to set the final-packet flag when the command length is an exact multiple of 17, so this implementation should not be used directly as the basis for new firmware compatibility.

## 10. Current Implementation Boundaries and Items Requiring Confirmation

The following items directly affect firmware integration:

1. The source does not parse fields in the `CMD 0x00` response other than the trailing MTU.
2. The source does not define the meanings of the two all-zero reserved regions in `CMD 0x01` or the response status format.
3. File-transfer failure statuses have semantic names but no numeric enumeration.
4. The device-side storage order, byte order, and `\U` prefix rule for track-list names must be confirmed with real device responses.
5. The mini program does not validate the outer frame's version, declared length, or sequence number. Firmware should still populate these fields correctly.
6. The mini program has no transport-frame retry mechanism. If the device detects a CRC8, block CRC16, or sequence error, recovery must be driven through a command status or another block request.
7. All BLE writes share one module-level queue with a fixed 30 ms interval. Other device commands should not be inserted concurrently while file data is being sent.

## 11. Source Index

| Content | Source |
| --- | --- |
| GATT UUIDs, connection, notifications, and writes | [`utils/bletool.js`](../utils/bletool.js) |
| Outer framing, CRC8, handshake/binding/unbind, and response reassembly | [`utils/hextool.js`](../utils/hextool.js) |
| CRC16, file-name encoding, file commands, and track commands | [`utils/operationFile.js`](../utils/operationFile.js) |
| Connection handshake and MTU processing sequence | [`pages/device/device.js`](../pages/device/device.js) |
| Generated-audio transfer flow | [`pages/generate/generate.js`](../pages/generate/generate.js) |
| Local MP3 import and track/capacity response handling | [`pages/devMusicList/devMusicList.js`](../pages/devMusicList/devMusicList.js) |

