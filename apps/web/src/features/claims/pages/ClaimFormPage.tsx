/**
 * ClaimFormPage - Create New Claim Page
 *
 * Dedicated page for creating a new claim (replaces dialog)
 */
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NewClaimForm } from '../components/NewClaimForm';

export function ClaimFormPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/claims')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title="Nouvelle Prise en Charge"
          description="Créer une nouvelle demande de prise en charge"
        />
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Informations de la PEC</CardTitle>
          <CardDescription>
            Remplissez les informations de la demande de prise en charge
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewClaimForm
            onSuccess={() => navigate('/claims')}
            onCancel={() => navigate('/claims')}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default ClaimFormPage;
