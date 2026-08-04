// SPDX-FileCopyrightText: 2026 ave
// SPDX-License-Identifier: MIT OR EUPL-1.2

/**
 * A protobuf writer, enough of one to build a synthetic NOVA SignedTicket.
 *
 * The field numbers live in the tests that use these, since that is where the
 * shape of a particular ticket is being asserted; this is only the wire
 * encoding. Nothing here comes from a real ticket.
 */
import { concat } from './build.ts';

/** BigInt based: millisecond timestamps do not fit in 32 bits. */
export const varint = (value: number): Uint8Array => {
	const out: number[] = [];
	let v = BigInt(value);
	do {
		let byte = Number(v & 0x7fn);
		v >>= 7n;
		if (v) byte |= 0x80;
		out.push(byte);
	} while (v);
	return new Uint8Array(out);
};

export const field = (number: number, wire: number) => varint((number << 3) | wire);
export const uint = (number: number, value: number) => concat(field(number, 0), varint(value));
export const bytes = (number: number, value: Uint8Array) =>
	concat(field(number, 2), varint(value.length), value);
export const str = (number: number, value: string) =>
	bytes(number, new TextEncoder().encode(value));
export const msg = (number: number, ...parts: Uint8Array[]) => bytes(number, concat(...parts));
/** Time messages wrap a single millisecond field. */
export const time = (number: number, msecs: number) => msg(number, uint(1, msecs));

/** A SignedTicket around an already built ticket body. */
export const signedTicket = (ticket: Uint8Array, rics: string) =>
	concat(msg(1, ticket), msg(2, uint(1, 1)), msg(4, str(1, rics), str(2, '00002')));
