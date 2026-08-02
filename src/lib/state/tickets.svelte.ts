import type { ParsedTicket } from '../tickets/types.ts';

/** In-memory ticket list - nothing is persisted, nothing leaves the device. */
class TicketStore {
	tickets = $state<ParsedTicket[]>([]);
	errors = $state<string[]>([]);

	add(ticket: ParsedTicket) {
		this.tickets = [ticket, ...this.tickets];
	}

	addErrors(errors: string[]) {
		if (errors.length) this.errors = [...errors, ...this.errors].slice(0, 5);
	}

	dismissError(i: number) {
		this.errors = this.errors.filter((_, idx) => idx !== i);
	}

	remove(id: string) {
		this.tickets = this.tickets.filter((t) => t.id !== id);
	}

	clear() {
		this.tickets = [];
		this.errors = [];
	}
}

export const store = new TicketStore();
