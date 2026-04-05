import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilePreview } from '@/components/ui/file-preview';
import { apiClient, API_BASE_URL } from '@/lib/api-client';

const contractFormSchema = z.object({
  insurerId: z.string().min(1, 'Assureur requis'),
  name: z.string().min(3, 'Minimum 3 caractères'),
  contractNumber: z.string().min(3, 'Minimum 3 caractères'),
  policyNumber: z.string().optional(),
  type: z.enum(['INDIVIDUAL', 'GROUP', 'CORPORATE']),
  startDate: z.string().min(1, 'Date de début requise'),
  endDate: z.string().min(1, 'Date de fin requise'),
  annualCeiling: z.number().min(0, 'Montant invalide'),
  coveragePharmacy: z.number().min(0).max(100),
  coverageConsultation: z.number().min(0).max(100),
  coverageLab: z.number().min(0).max(100),
  coverageHospitalization: z.number().min(0).max(100),
});

type ContractFormData = z.infer<typeof contractFormSchema>;

export type ContractFormDataWithFile = ContractFormData & {
  documentFile?: File;
};

interface ContractProp {
  id: string;
  insurerId: string;
  name?: string;
  contractNumber: string;
  policyNumber?: string;
  // Frontend names
  type?: 'INDIVIDUAL' | 'GROUP' | 'CORPORATE';
  annualCeiling?: number;
  coveragePharmacy?: number;
  coverageConsultation?: number;
  coverageLab?: number;
  coverageHospitalization?: number;
  // Backend names (from API)
  planType?: string;
  annualLimit?: number;
  coverageJson?: {
    pharmacy?: { reimbursementRate?: number; enabled?: boolean } | number;
    consultation?: { reimbursementRate?: number; enabled?: boolean } | number;
    lab?: { reimbursementRate?: number; enabled?: boolean } | number;
    hospitalization?: { reimbursementRate?: number; enabled?: boolean } | number;
    [key: string]: unknown;
  };
  startDate: string;
  endDate: string;
  documentId?: string;
  documentUrl?: string;
}

interface ContractFormProps {
  contract?: ContractProp;
  onSubmit: (data: ContractFormDataWithFile) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const CONTRACT_TYPES = {
  INDIVIDUAL: 'Individuel',
  GROUP: 'Groupe',
  CORPORATE: 'Entreprise',
};

export function ContractForm({ contract, onSubmit, onCancel, isLoading }: ContractFormProps) {
  const isEditing = !!contract;
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: insurers } = useQuery({
    queryKey: ['insurers-list'],
    queryFn: async () => {
      const response = await apiClient.get<{ id: string; name: string }[]>('/insurers', {
        params: { limit: 100 },
      });
      if (!response.success) throw new Error(response.error?.message);
      // API returns paginated: { data: [...], meta: {...} }
      const raw = response as unknown as { data: { id: string; name: string }[] };
      return Array.isArray(raw.data) ? raw.data : [];
    },
  });

  const getCoverageRate = (val: unknown, fallback: number): number => {
    if (typeof val === 'number') return val;
    if (val && typeof val === 'object' && 'reimbursementRate' in val) return (val as { reimbursementRate: number }).reimbursementRate;
    return fallback;
  };

  const mapPlanType = (c: ContractProp): 'INDIVIDUAL' | 'GROUP' | 'CORPORATE' => {
    const raw = c.type || c.planType || 'INDIVIDUAL';
    // Backend uses lowercase (individual, family, corporate), frontend uses uppercase
    const mapping: Record<string, 'INDIVIDUAL' | 'GROUP' | 'CORPORATE'> = {
      individual: 'INDIVIDUAL',
      INDIVIDUAL: 'INDIVIDUAL',
      family: 'GROUP',
      GROUP: 'GROUP',
      group: 'GROUP',
      corporate: 'CORPORATE',
      CORPORATE: 'CORPORATE',
    };
    return mapping[raw] || 'INDIVIDUAL';
  };

  const mapContractToFormValues = (c: ContractProp): ContractFormData => ({
    insurerId: c.insurerId || '',
    name: c.name || c.contractNumber || '',
    contractNumber: c.contractNumber || '',
    policyNumber: c.policyNumber || '',
    type: mapPlanType(c),
    startDate: c.startDate?.split('T')[0] || '',
    endDate: c.endDate?.split('T')[0] || '',
    annualCeiling: c.annualCeiling
      ? c.annualCeiling / 1000
      : c.annualLimit
        ? c.annualLimit / 1000
        : 5000,
    coveragePharmacy: c.coveragePharmacy ?? getCoverageRate(c.coverageJson?.pharmacy, 80),
    coverageConsultation: c.coverageConsultation ?? getCoverageRate(c.coverageJson?.consultation, 70),
    coverageLab: c.coverageLab ?? getCoverageRate(c.coverageJson?.lab, 70),
    coverageHospitalization: c.coverageHospitalization ?? getCoverageRate(c.coverageJson?.hospitalization, 80),
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ContractFormData>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: contract
      ? mapContractToFormValues(contract)
      : {
          insurerId: '',
          name: '',
          contractNumber: '',
          policyNumber: '',
          type: 'INDIVIDUAL',
          startDate: '',
          endDate: '',
          annualCeiling: 5000,
          coveragePharmacy: 80,
          coverageConsultation: 70,
          coverageLab: 70,
          coverageHospitalization: 80,
        },
  });

  // Reset form when contract data loads (async fetch)
  useEffect(() => {
    if (contract && insurers) {
      const values = mapContractToFormValues(contract);
      reset(values);
      // Explicitly set select values after reset to ensure Radix UI picks them up
      setTimeout(() => {
        if (values.insurerId) setValue('insurerId', values.insurerId, { shouldValidate: true });
        if (values.type) setValue('type', values.type, { shouldValidate: true });
      }, 0);
    }
  }, [contract, insurers, reset, setValue]);

  const selectedType = watch('type');
  const selectedInsurerId = watch('insurerId');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        alert('Seuls les fichiers PDF sont acceptes');
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB max
        alert('Le fichier ne doit pas dépassér 10 Mo');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFormSubmit = (data: ContractFormData) => {
    onSubmit({
      ...data,
      annualCeiling: data.annualCeiling * 1000, // Convert to millimes
      documentFile: selectedFile || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <div className="space-y-4">
        <h3 className="font-medium">Informations générales</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Assureur</Label>
            <Select value={selectedInsurerId} onValueChange={(value) => setValue('insurerId', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un assureur" />
              </SelectTrigger>
              <SelectContent>
                {insurers?.map((insurer) => (
                  <SelectItem key={insurer.id} value={insurer.id}>
                    {insurer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.insurerId && (
              <p className="text-destructive text-sm">{errors.insurerId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Type de contrat</Label>
            <Select value={selectedType} onValueChange={(value: 'INDIVIDUAL' | 'GROUP' | 'CORPORATE') => setValue('type', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CONTRACT_TYPES).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Nom du contrat</Label>
            <Input id="name" {...register('name')} placeholder="Ex: Formule Premium" />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contractNumber">Numéro de contrat</Label>
            <Input id="contractNumber" {...register('contractNumber')} placeholder="Ex: CTR-2024-001" />
            {errors.contractNumber && (
              <p className="text-destructive text-sm">{errors.contractNumber.message}</p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="policyNumber">Numéro de police (optionnel)</Label>
            <Input id="policyNumber" {...register('policyNumber')} placeholder="Ex: POL-2024-001" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="startDate">Date de début</Label>
            <Input id="startDate" type="date" {...register('startDate')} />
            {errors.startDate && (
              <p className="text-destructive text-sm">{errors.startDate.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="endDate">Date de fin</Label>
            <Input id="endDate" type="date" {...register('endDate')} />
            {errors.endDate && (
              <p className="text-destructive text-sm">{errors.endDate.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="annualCeiling">Plafond annuel (TND)</Label>
          <Input
            id="annualCeiling"
            type="number"
            {...register('annualCeiling', { valueAsNumber: true })}
            placeholder="5000"
          />
          {errors.annualCeiling && (
            <p className="text-destructive text-sm">{errors.annualCeiling.message}</p>
          )}
        </div>
      </div>

      {/* Document PDF Section */}
      <div className="space-y-4">
        <h3 className="font-medium">Document du contrat (PDF)</h3>
        <div className="space-y-2">
          <Label>Fichier PDF du contrat</Label>

          {/* Existing document info */}
          {contract?.documentId && !selectedFile && (
            <FilePreview
              url={`${API_BASE_URL}/documents/${contract.documentId}/download`}
              fileName={`Contrat_${contract.contractNumber}.pdf`}
              showRemove={false}
            />
          )}

          {/* Selected file preview */}
          {selectedFile && (
            <FilePreview
              file={selectedFile}
              onRemove={handleRemoveFile}
            />
          )}

          {/* File upload area - show only if no file selected and no existing document */}
          {!selectedFile && !contract?.documentId && (
            <div
              className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Cliquez pour sélectionner un PDF</p>
              <p className="text-xs text-muted-foreground">ou glissez-deposez le fichier ici (max 10 Mo)</p>
            </div>
          )}

          {/* Button to replace existing document */}
          {contract?.documentId && !selectedFile && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2"
            >
              <Upload className="h-4 w-4 mr-2" />
              Remplacer le document
            </Button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-medium">Taux de couverture (%)</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="coveragePharmacy">Pharmacie</Label>
            <Input
              id="coveragePharmacy"
              type="number"
              min="0"
              max="100"
              {...register('coveragePharmacy', { valueAsNumber: true })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coverageConsultation">Consultation</Label>
            <Input
              id="coverageConsultation"
              type="number"
              min="0"
              max="100"
              {...register('coverageConsultation', { valueAsNumber: true })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coverageLab">Laboratoire</Label>
            <Input
              id="coverageLab"
              type="number"
              min="0"
              max="100"
              {...register('coverageLab', { valueAsNumber: true })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coverageHospitalization">Hospitalisation</Label>
            <Input
              id="coverageHospitalization"
              type="number"
              min="0"
              max="100"
              {...register('coverageHospitalization', { valueAsNumber: true })}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Enregistrement...' : isEditing ? 'Mettre à jour' : 'Créer le contrat'}
        </Button>
      </div>
    </form>
  );
}
