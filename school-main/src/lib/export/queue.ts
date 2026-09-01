import { Queue } from "bullmq";
import { redis } from "@/lib/redis";

export const exportQueue = new Queue("exports", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100, // keep last 100 completed jobs
    removeOnFail: 50,
  },
});

export type ExportType = 
  | "attendance-class"
  | "attendance-student"
  | "attendance-teacher"
  | "fees-daily"
  | "fees-term"
  | "fees-defaulters"
  | "results-markbook"
  | "results-portfolio";

export interface ExportJobData {
  type: ExportType;
  schoolId: string;
  userId: string; // who requested it
  filters: Record<string, any>; // type-specific filters
  format: "csv" | "pdf";
}