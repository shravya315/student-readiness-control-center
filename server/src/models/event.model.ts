import mongoose, { Document, Schema } from 'mongoose';

export interface IEvent extends Document {
  eventId: string;
  type: 'attempt.succeeded' | 'attempt.rejected';
  tenantId: string;
  studentId: string;
  attemptId?: string;
  idempotencyKey?: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

const eventSchema = new Schema<IEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      enum: ['attempt.succeeded', 'attempt.rejected'],
      index: true,
    },

    tenantId: {
      type: String,
      required: true,
      index: true,
    },

    studentId: {
      type: String,
      required: true,
      index: true,
    },

    attemptId: {
      type: String,
    },

    idempotencyKey: {
      type: String,
    },

    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },

    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    versionKey: false,
  }
);

export const Event = mongoose.model<IEvent>('Event', eventSchema);