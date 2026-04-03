/**
 * ContractFormPage - Create/Edit Contract Page
 *
 * Dedicated page for contract creation and editing (replaces dialog)
 */
import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient, API_BASE_URL } from '@/lib/api-client';
import { ContractForm, type ContractFormDataWithFile } from '../components/ContractForm';
import { toast } from 'sonner';

interface Contract {
  id: string;
  insurerId: string;
  insurerName?: string;
  contractNumber: string;
  policyNumber?: string;
  name?: string;
  // Backend field names (from API)
  planType?: string;
  annualLimit?: number;
  coverageJson?: Record<string, unknown>;
  // Frontend field names (may not exist from API)
  type?: 'INDIVIDUAL' | 'GROUP' | 'CORPORATE';
  coveragePharmacy?: number;
  coverageConsultation?: number;
  coverageLab?: number;
  coverageHospitalization?: number;
  annualCeiling?: number;
  startDate: string;
  endDate: string;
  status?: string;
  adhérentCount?: number;
  documentId?: string;
  documentUrl?: string;
  createdAt?: string;
}

interface DocumentUploadResponse {
  id: string;
  url: string;
  originalName: string;
}

async function uploadDocument(file: File, contractId: string): Promise<DocumentUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', 'contract');
  formData.append('entityType', 'contract');
  formData.append('entityId', contractId);

  const response = await fetch(
    `${API_BASE_URL}/documents/upload`,
    {
      method: 'POST',
      body: formData,
      credentials: 'include',
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Upload failed');
  }

  const result = await response.json();
  return result.data;
}

export function ContractFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEditing = !!id;
  const { hasPermission } = usePermissions();
  const [isUploading, setIsUploading] = useState(false);

  const { data: contract, isLoading: isLoadingContract } = useQuery({
    queryKey: ['contracts', id],
    queryFn: async () => {
      const response = await apiClient.get<Contract>(`/contracts/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });

  const createMutation = useMutation({
    mutationFn: async (data: ContractFormDataWithFile) => {
      const { documentFile, ...contractData } = data;

      // Create contract first
      const response = await apiClient.post<Contract>('/contracts', contractData);
      if (!response.success) throw new Error(response.error?.message);
      const createdContract = response.data;

      // If there's a file, upload it
      if (documentFile && createdContract?.id) {
        setIsUploading(true);
        try {
          const uploadResult = await uploadDocument(documentFile, createdContract.id);
          // Update contract with document info
          await apiClient.put(`/contracts/${createdContract.id}`, {
            documentId: uploadResult.id,
            documentUrl: uploadResult.url,
          });
        } finally {
          setIsUploading(false);
        }
      }

      return createdContract;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contracts', id] });
      toast.success('Contrat créé avec succès');
      navigate('/contracts');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la création du contrat');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ContractFormDataWithFile) => {
      const { documentFile, ...contractData } = data;

      // If there's a new file, upload it first
      let documentId = contract?.documentId;
      let documentUrl = contract?.documentUrl;

      if (documentFile && id) {
        setIsUploading(true);
        try {
          const uploadResult = await uploadDocument(documentFile, id);
          documentId = uploadResult.id;
          documentUrl = uploadResult.url;
        } finally {
          setIsUploading(false);
        }
      }

      // Update contract with all form data + document info
      const response = await apiClient.put<Contract>(`/contracts/${id}`, {
        ...contractData,
        documentId,
        documentUrl,
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['contracts', id] });
      toast.success('Contrat mis à jour avec succès');
      navigate('/contracts');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    },
  });

  const handleSubmit = (data: ContractFormDataWithFile) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending || isUploading;

  if (isEditing && isLoadingContract) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!hasPermission('contracts', isEditing ? 'update' : 'create')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-semibold text-gray-900">Accès refusé</p>
        <p className="mt-1 text-sm text-gray-500">Vous n'avez pas la permission de {isEditing ? 'modifier' : 'créer'} un contrat.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-blue-600 hover:underline">Retour</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/contracts" className="hover:text-gray-900 transition-colors">Contrats</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">{isEditing ? 'Modifier' : 'Nouveau Contrat'}</span>
      </nav>
      <PageHeader
        title={isEditing ? 'Modifier le contrat' : 'Nouveau contrat'}
        description={isEditing ? 'Modifier les informations du contrat' : 'Créer un nouveau contrat d\'assurance santé'}
      />

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{isEditing ? 'Informations du contrat' : 'Informations du nouveau contrat'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Modifiez les champs ci-dessous puis cliquez sur Enregistrer'
              : 'Remplissez les informations du nouveau contrat'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContractForm
            contract={contract}
            onSubmit={handleSubmit}
            onCancel={() => navigate('/contracts')}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default ContractFormPage;
