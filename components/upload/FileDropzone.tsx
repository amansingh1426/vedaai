'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { 
  FileUp, 
  FileText, 
  Image as ImageIcon, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  FileType 
} from 'lucide-react';
import { clsx } from 'clsx';

interface FileDropzoneProps {
  title: string;
  subtitle?: string;
  description: string;
  acceptLabel: string;
  file: File | null;
  onFileSelect: (file: File | null) => void;
  icon?: 'document' | 'image' | 'upload';
  badgeLabel?: string;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export const FileDropzone: React.FC<FileDropzoneProps> = ({
  title,
  subtitle,
  description,
  acceptLabel,
  file,
  onFileSelect,
  icon = 'upload',
  badgeLabel,
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      setErrorMessage(null);

      if (rejectedFiles.length > 0) {
        const rejection = rejectedFiles[0];
        if (rejection.errors.some((e) => e.code === 'file-too-large')) {
          setErrorMessage('File exceeds the 20MB limit. Please upload a smaller file.');
        } else if (rejection.errors.some((e) => e.code === 'file-invalid-type')) {
          setErrorMessage('Invalid format. Only PDF, PNG, JPG, and JPEG are supported.');
        } else {
          setErrorMessage(rejection.errors[0]?.message || 'File upload failed. Please try again.');
        }
        return;
      }

      if (acceptedFiles.length > 0) {
        const selected = acceptedFiles[0];
        if (selected.size === 0) {
          setErrorMessage('Selected file is empty (0 bytes). Please upload a valid document.');
          return;
        }
        onFileSelect(selected);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
    },
    maxSize: MAX_FILE_SIZE,
    multiple: false,
  });

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setErrorMessage(null);
    onFileSelect(null);
  };

  const isPdf = file?.type === 'application/pdf' || file?.name.toLowerCase().endsWith('.pdf');
  const isImage = file?.type.startsWith('image/') || file?.name.match(/\.(png|jpg|jpeg|webp)$/i);

  return (
    <div className="flex flex-col gap-2 w-full">
      <div
        {...getRootProps()}
        className={clsx(
          'relative flex flex-col items-center justify-center p-6 text-center border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-200 min-h-[240px]',
          // Active Drag States
          isDragActive && !isDragReject && 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 scale-[1.01]',
          isDragReject && 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20',
          // Selected File State
          file && 'border-emerald-400/80 bg-emerald-50/30 dark:bg-emerald-950/10 hover:border-emerald-500',
          // Default State
          !file && !isDragActive && 'border-slate-200 hover:border-indigo-400 bg-white hover:bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-indigo-600/70 shadow-sm'
        )}
      >
        <input {...getInputProps()} />

        {/* Top Badge */}
        {badgeLabel && (
          <span className="absolute top-4 left-4 rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {badgeLabel}
          </span>
        )}

        {file ? (
          /* File Selected Card State */
          <div className="flex flex-col items-center gap-3 w-full max-w-sm px-2 animate-in fade-in zoom-in-95 duration-200">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400 shadow-inner">
              {isPdf ? (
                <FileText className="h-7 w-7" />
              ) : (
                <ImageIcon className="h-7 w-7" />
              )}
              <CheckCircle2 className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-white dark:bg-slate-900 text-emerald-500 fill-emerald-100" />
            </div>

            <div className="text-center w-full">
              <p className="font-semibold text-slate-900 dark:text-white truncate max-w-[260px] mx-auto text-sm" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {formatFileSize(file.size)} • {isPdf ? 'PDF Document' : 'Image File'}
              </p>
            </div>

            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/50 rounded-lg transition-colors border border-rose-200 dark:border-rose-800"
              >
                <X className="h-3.5 w-3.5" />
                Remove
              </button>
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                Click to change
              </span>
            </div>
          </div>
        ) : (
          /* Idle / Empty Upload State */
          <div className="flex flex-col items-center gap-3">
            <div className={clsx(
              "flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-200",
              isDragActive ? "scale-110 bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-600"
            )}>
              <FileUp className="h-7 w-7 stroke-[1.75]" />
            </div>

            <div className="flex flex-col gap-1">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-base">
                {title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                {description}
              </p>
            </div>

            <div className="flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800/80 px-3 py-1 text-[11px] text-slate-600 dark:text-slate-400 font-medium mt-1">
              <FileType className="h-3.5 w-3.5 text-slate-400" />
              <span>{acceptLabel}</span>
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Drag & drop or <span className="text-indigo-600 dark:text-indigo-400 font-medium">browse</span> (Max 20MB)
            </p>
          </div>
        )}
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900 animate-in fade-in slide-in-from-top-1">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
