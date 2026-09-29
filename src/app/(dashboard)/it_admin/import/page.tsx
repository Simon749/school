"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { importStudentsAction } from "@/app/actions/it-admin-actions";
import { toast } from "sonner";
import Papa from "papaparse";

const importSchema = z.object({
  file: z.instanceof(File).refine((f) => f.type === "text/csv" || f.name.endsWith(".csv"), {
    message: "Only CSV files are allowed",
  }),
});

type ImportFormValues = z.infer<typeof importSchema>;

export default function ItAdminImportPage() {
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<ImportFormValues>({
    resolver: zodResolver(importSchema),
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const validated = (results.data as any[]).map((row, index) => {
          const hasErrors = !row.firstName || !row.lastName || !row.nemisNumber || !row.grade || !row.stream;
          return {
            rowNumber: index + 2, ...row,
            isValid: !hasErrors,
            error: hasErrors ? "Missing required fields (firstName, lastName, nemisNumber, grade, stream)" : null,
          };
        });
        setPreviewData(validated);
      },
    });
  };

  const onSubmit = async () => {
    setIsImporting(true);
    try {
      const validRows = previewData.filter((d) => d.isValid);
      const result = await importStudentsAction(validRows);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Successfully imported ${result.count} students.`);
        setPreviewData([]);
      }
    } catch {
      toast.error("Import failed");
    } finally {
      setIsImporting(false);
    }
  };

  const validCount = previewData.filter((d) => d.isValid).length;
  const invalidCount = previewData.filter((d) => !d.isValid).length;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Import Students</h1>
        <p className="text-slate-500">Upload a CSV file to bulk-enroll students. Required: firstName, lastName, nemisNumber, grade, stream.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>1. Upload & Validate CSV</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input type="file" accept=".csv" {...register("file")} onChange={(e) => { register("file").onChange(e); handleFileChange(e); }} className="max-w-sm" />
            {errors.file && <p className="text-sm text-red-500">{errors.file.message}</p>}

            {previewData.length > 0 && (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <Badge className="bg-green-50 text-green-700 border-green-200">{validCount} Valid Rows</Badge>
                  <Badge variant="destructive">{invalidCount} Invalid Rows</Badge>
                </div>
                <div className="border rounded-md max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Row</TableHead><TableHead>Status</TableHead>
                        <TableHead>First Name</TableHead><TableHead>Last Name</TableHead>
                        <TableHead>NEMIS</TableHead><TableHead>Grade</TableHead><TableHead>Stream</TableHead><TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.map((row, idx) => (
                        <TableRow key={idx} className={!row.isValid ? "bg-red-50" : ""}>
                          <TableCell>{row.rowNumber}</TableCell>
                          <TableCell><Badge variant={row.isValid ? "default" : "destructive"}>{row.isValid ? "Valid" : "Invalid"}</Badge></TableCell>
                          <TableCell>{row.firstName}</TableCell><TableCell>{row.lastName}</TableCell>
                          <TableCell>{row.nemisNumber}</TableCell><TableCell>{row.grade}</TableCell><TableCell>{row.stream}</TableCell>
                          <TableCell className="text-red-600 text-sm">{row.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setPreviewData([])}>Clear</Button>
                  <Button type="submit" disabled={validCount === 0 || isImporting}>
                    {isImporting ? "Importing..." : `Import ${validCount} Valid Students`}
                  </Button>
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}