// src/components/results/AssessmentDetail.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";

interface RubricScore {
  id: string;
  score: string;
  comment: string | null;
  subStrand: {
    id: string;
    name: string;
    strand: { name: string };
  };
}

interface Assessment {
  id: string;
  title: string;
  type: string;
  maxMarks: number | null;
  assessmentDate: string | null;
  learningArea: { name: string; color: string | null };
}

interface Result {
  id: string;
  marksObtained: number | null;
  teacherComment: string | null;
  rubricScores: RubricScore[];
}

interface AssessmentDetailProps {
  assessment: Assessment;
  result: Result;
}

const getRubricColor = (score: string) => {
  const colors: Record<string, string> = {
    EE: "bg-green-100 text-green-800 border-green-300",
    ME: "bg-blue-100 text-blue-800 border-blue-300",
    AE: "bg-yellow-100 text-yellow-800 border-yellow-300",
    BE: "bg-red-100 text-red-800 border-red-300",
  };
  return colors[score] || "bg-gray-100 text-gray-800";
};

const getRubricLabel = (score: string) => {
  const labels: Record<string, string> = {
    EE: "Exceeding Expectations",
    ME: "Meeting Expectations",
    AE: "Approaching Expectations",
    BE: "Below Expectations",
  };
  return labels[score] || score;
};

export function AssessmentDetail({ assessment, result }: AssessmentDetailProps) {
  const [expanded, setExpanded] = useState(false);

  const hasRubric = result.rubricScores.length > 0;

  // Group rubric scores by strand
  const scoresByStrand = result.rubricScores.reduce((acc, score) => {
    const strandName = score.subStrand.strand.name;
    if (!acc[strandName]) acc[strandName] = [];
    acc[strandName].push(score);
    return acc;
  }, {} as Record<string, RubricScore[]>);

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(!expanded)}
        className="w-full justify-between"
      >
        <span>{expanded ? "Hide Details" : "View Full Breakdown"}</span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>

      {expanded && (
        <Card className="mt-3 border-2">
          <CardContent className="pt-4 space-y-4">
            {/* Numeric Marks */}
            {!hasRubric && result.marksObtained && assessment.maxMarks && (
              <div>
                <h4 className="font-semibold mb-2">Score</h4>
                <p className="text-2xl font-bold">
                  {Number(result.marksObtained)}{" "}
                  <span className="text-lg text-muted-foreground">
                    / {Number(assessment.maxMarks)}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {((Number(result.marksObtained) / Number(assessment.maxMarks)) * 100).toFixed(1)}%
                </p>
              </div>
            )}

            {/* CBC Rubric Breakdown */}
            {hasRubric && (
              <div>
                <h4 className="font-semibold mb-3">CBC Rubric Breakdown</h4>
                <div className="space-y-4">
                  {Object.entries(scoresByStrand).map(([strandName, scores]) => (
                    <div key={strandName} className="border-l-4 border-blue-500 pl-4">
                      <h5 className="font-medium text-sm mb-2">{strandName}</h5>
                      <div className="space-y-2">
                        {scores.map((score) => (
                          <div
                            key={score.id}
                            className="flex items-start justify-between gap-2"
                          >
                            <div className="flex-1">
                              <p className="text-sm font-medium">
                                {score.subStrand.name}
                              </p>
                              {score.comment && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {score.comment}
                                </p>
                              )}
                            </div>
                            <Badge
                              className={`${getRubricColor(
                                score.score
                              )} border text-xs font-semibold whitespace-nowrap`}
                            >
                              {score.score}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Rubric Legend */}
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs font-medium mb-2">Rubric Guide:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-800 border border-green-300">
                        EE
                      </Badge>
                      <span>Exceeding Expectations</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-800 border border-blue-300">
                        ME
                      </Badge>
                      <span>Meeting Expectations</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-300">
                        AE
                      </Badge>
                      <span>Approaching Expectations</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-red-100 text-red-800 border border-red-300">
                        BE
                      </Badge>
                      <span>Below Expectations</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Teacher Comment */}
            {result.teacherComment && (
              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">Teacher's Comment</h4>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-md">
                  {result.teacherComment}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}