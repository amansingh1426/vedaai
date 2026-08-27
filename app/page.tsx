'use client';

import React, { useState } from 'react';
import { Header } from '@/components/ui/Header';
import { UploadScreen } from '@/components/upload/UploadScreen';
import { ProcessingScreen } from '@/components/processing/ProcessingScreen';
import { ResultsScreen } from '@/components/results/ResultsScreen';
import { createSamplePdfFiles } from '@/lib/sampleData';

export default function Home() {
  const [stage, setStage] = useState<'upload' | 'processing' | 'results'>('upload');
  const [selectedQuestionFile, setSelectedQuestionFile] = useState<File | null>(null);
  const [selectedAnswerFile, setSelectedAnswerFile] = useState<File | null>(null);
  const [pipelineData, setPipelineData] = useState<any>(null);

  const handleStartMapping = (qFile: File, aFile: File) => {
    setSelectedQuestionFile(qFile);
    setSelectedAnswerFile(aFile);
    setPipelineData(null);
    setStage('processing');
  };

  const handleLoadSample = () => {
    const { questionFile, answerFile } = createSamplePdfFiles();
    handleStartMapping(questionFile, answerFile);
  };

  const handleBackToUpload = () => {
    setStage('upload');
    setPipelineData(null);
  };

  const handleProcessingComplete = (data: any) => {
    setPipelineData(data);
    setStage('results');
  };

  return (
    <main className="min-h-screen bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <Header />
      <div className="flex-1 flex flex-col">
        {stage === 'upload' && (
          <UploadScreen 
            onStartMapping={handleStartMapping} 
            onLoadSampleData={handleLoadSample}
          />
        )}

        {stage === 'processing' && selectedQuestionFile && selectedAnswerFile && (
          <ProcessingScreen
            questionFile={selectedQuestionFile}
            answerFile={selectedAnswerFile}
            onCancel={handleBackToUpload}
            onComplete={handleProcessingComplete}
          />
        )}

        {stage === 'results' && pipelineData && (
          <ResultsScreen
            questionDoc={pipelineData.questionDoc}
            answerDoc={pipelineData.answerDoc}
            extractedQuestions={pipelineData.extractedQuestions}
            extractedAnswers={pipelineData.extractedAnswers}
            mappings={pipelineData.mappings || []}
            unmatchedAnswers={pipelineData.unmatchedAnswers || []}
            summary={pipelineData.summary}
            lowConfidenceMatch={pipelineData.lowConfidenceMatch}
            warning={pipelineData.warning}
            onBackToUpload={handleBackToUpload}
          />
        )}
      </div>
    </main>
  );
}
