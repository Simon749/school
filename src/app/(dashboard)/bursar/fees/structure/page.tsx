"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Save, CheckCircle2, AlertCircle, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox"; // Ensure you have this shadcn component
import { toast } from "sonner"; // Or your preferred toast library

// ---------------------------------------------------------------------------
// Validation Schema
// ---------------------------------------------------------------------------
const feeItemSchema = z.object({
  name: z.string().min(1, "Fee name is required"),
  amount: z.coerce.number().min(0, "Amount must be 0 or more"),
  isMandatory: z.boolean(),
  isOptionalActivity: z.boolean(),
  priorityOrder: z.number(),
});

const formSchema = z.object({
  termId: z.string().min(1, "Please select a term"),
  name: z.string().min(1, "Structure name is required"),
  items: z.array(feeItemSchema).min(1, "Add at least one fee item"),
});

type FeeItem = z.infer<typeof feeItemSchema>;
type FormData = z.infer<typeof formSchema>;

// ---------------------------------------------------------------------------
// Types for API responses
// ---------------------------------------------------------------------------
type Term = { id: string; name: string; isCurrent: boolean };
type Stream = { id: string; name: string; grade: { name: string } };
type FeeStructure = {
  id: string;
  name: string;
  termId: string;
  feeItems: FeeItem[];
  assignedStreams?: string[]; // If your API returns this
};

export default function FeeStructurePage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Assignment state
  const [assigningStructureId, setAssigningStructureId] = useState<string | null>(null);
  const [selectedStreamsForAssignment, setSelectedStreamsForAssignment] = useState<Set<string>>(new Set());

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      termId: "",
      name: "Term Fees",
      items: [
        { name: "Tuition Fee", amount: 0, isMandatory: true, isOptionalActivity: false, priorityOrder: 1 },
        { name: "Lunch Fee", amount: 0, isMandatory: true, isOptionalActivity: false, priorityOrder: 2 },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function loadData() {
      try {
        const [termsRes, gradesRes] = await Promise.all([
          fetch("/api/terms"),
          fetch("/api/grades"),
        ]);
        const termsData = await termsRes.json();
        const gradesData = await gradesRes.json();

        setTerms(termsData.terms || []);
        const allStreams: Stream[] = (gradesData.grades || []).flatMap((g: any) =>
          g.streams.map((s: any) => ({ ...s, grade: g }))
        );
        setStreams(allStreams);

        // Set default term to current
        const currentTerm = termsData.terms?.find((t: Term) => t.isCurrent);
        if (currentTerm) {
          form.setValue("termId", currentTerm.id);
        }

        // Fetch existing structures once term is set (we'll do this in a separate effect or here if term is known)
      } catch (error) {
        console.error("Failed to load initial data", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    const termId = form.watch("termId");
    if (!termId) return;
    fetch(`/api/fees/structure?termId=${termId}`)
      .then((r) => r.json())
      .then((d) => setStructures(d.structures || []))
      .catch(() => setStructures([]));
  }, [form.watch("termId")]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  async function onSubmit(data: FormData) {
    setSaving(true);
    try {
      const res = await fetch("/api/fees/structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      const result = await res.json();
      
      setStructures((prev) => [...prev, result.structure]);
      toast.success("Fee structure saved successfully");
      form.reset({ ...data, items: [] }); // Keep term/name, clear items for next entry? Or keep as is.
    } catch (error) {
      toast.error("Failed to save fee structure");
    } finally {
      setSaving(false);
    }
  }

  function addItem(isOptional: boolean) {
    append({
      name: "",
      amount: 0,
      isMandatory: !isOptional,
      isOptionalActivity: isOptional,
      priorityOrder: fields.length + 1,
    });
  }

  function formatKes(amount: number) {
    return `KES ${amount.toLocaleString()}`;
  }

  // Assignment logic
  function toggleStreamForAssignment(streamId: string) {
    const next = new Set(selectedStreamsForAssignment);
    if (next.has(streamId)) next.delete(streamId);
    else next.add(streamId);
    setSelectedStreamsForAssignment(next);
  }

  async function handleConfirmAssignment() {
    if (!assigningStructureId || selectedStreamsForAssignment.size === 0) return;
    
    try {
      const res = await fetch("/api/fees/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          structureId: assigningStructureId,
          streamIds: Array.from(selectedStreamsForAssignment),
        }),
      });
      if (!res.ok) throw new Error("Assignment failed");
      
      toast.success(`Assigned to ${selectedStreamsForAssignment.size} stream(s)`);
      setAssigningStructureId(null);
      setSelectedStreamsForAssignment(new Set());
    } catch (error) {
      toast.error("Failed to assign structure");
    }
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading fee structure data...</div>;

  const mandatoryItems = fields.filter((f) => !f.isOptionalActivity);
  const optionalItems = fields.filter((f) => f.isOptionalActivity);

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Fee Structure Builder</h1>
        <p className="text-slate-500">Define fee items for the term and assign them to streams.</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* 1. Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>1. Structure Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Academic Term</Label>
              <Select
                value={form.watch("termId")}
                onValueChange={(val) => {
                  if (val) form.setValue("termId", val);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} {t.isCurrent && "(Current)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.termId && (
                <p className="text-xs text-red-500">{form.formState.errors.termId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Structure Name</Label>
              <Input
                {...form.register("name")}
                placeholder="e.g. Term 2 2026 Standard Fees"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. Fee Items */}
        <Card>
          <CardHeader>
            <CardTitle>2. Fee Items</CardTitle>
            <CardDescription>
              Add mandatory fees (Tuition, Lunch) and optional activities (Sports, Music).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Mandatory Section */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Core / Mandatory Fees</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => addItem(false)}>
                  <Plus className="mr-1 h-3 w-3" /> Add Mandatory Item
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-32">Amount (KES)</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mandatoryItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-400 py-4">
                        No mandatory items added yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    mandatoryItems.map((field, index) => {
                      const actualIndex = fields.findIndex((f) => f.id === field.id);
                      return (
                        <TableRow key={field.id}>
                          <TableCell className="font-mono text-xs text-slate-500">{index + 1}</TableCell>
                          <TableCell>
                            <Input
                              {...form.register(`items.${actualIndex}.name`)}
                              placeholder="e.g. Tuition Fee"
                              className={form.formState.errors.items?.[actualIndex]?.name ? "border-red-500" : ""}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              {...form.register(`items.${actualIndex}.amount`)}
                              placeholder="0"
                              className={form.formState.errors.items?.[actualIndex]?.amount ? "border-red-500" : ""}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(actualIndex)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Optional Section */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700">Optional Activities</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => addItem(true)}>
                  <Plus className="mr-1 h-3 w-3" /> Add Activity
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Activity Name</TableHead>
                    <TableHead className="w-32">Fee (KES)</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {optionalItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-400 py-4">
                        No optional activities added yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    optionalItems.map((field, index) => {
                      const actualIndex = fields.findIndex((f) => f.id === field.id);
                      return (
                        <TableRow key={field.id}>
                          <TableCell className="font-mono text-xs text-slate-500">{index + 1}</TableCell>
                          <TableCell>
                            <Input
                              {...form.register(`items.${actualIndex}.name`)}
                              placeholder="e.g. Football Club"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              {...form.register(`items.${actualIndex}.amount`)}
                              placeholder="0"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(actualIndex)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end pt-4">
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                {saving ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" /> Save Fee Structure
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* 3. Existing Structures & Assignment */}
      {structures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>3. Existing Structures & Assignment</CardTitle>
            <CardDescription>
              Assign saved fee structures to specific streams.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {structures.map((structure) => (
              <div key={structure.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-900">{structure.name}</h4>
                    <p className="text-sm text-slate-500">
                      {structure.feeItems?.length || 0} items • 
                      Mandatory: {formatKes(structure.feeItems?.filter((i) => i.isMandatory).reduce((sum, i) => sum + Number(i.amount), 0) || 0)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAssigningStructureId(structure.id);
                      setSelectedStreamsForAssignment(new Set());
                    }}
                  >
                    <Users className="mr-2 h-3 w-3" /> Assign Streams
                  </Button>
                </div>

                {/* Inline Assignment Panel */}
                {assigningStructureId === structure.id && (
                  <div className="mt-4 rounded-md bg-slate-50 p-4 border">
                    <h5 className="mb-3 text-sm font-medium text-slate-700">Select Streams to Assign:</h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-60 overflow-y-auto">
                      {streams.map((stream) => (
                        <div key={stream.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`stream-${stream.id}`}
                            checked={selectedStreamsForAssignment.has(stream.id)}
                            onCheckedChange={() => toggleStreamForAssignment(stream.id)}
                          />
                          <Label htmlFor={`stream-${stream.id}`} className="text-xs cursor-pointer">
                            {stream.grade.name} {stream.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAssigningStructureId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={selectedStreamsForAssignment.size === 0}
                        onClick={handleConfirmAssignment}
                      >
                        Confirm Assignment ({selectedStreamsForAssignment.size})
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}