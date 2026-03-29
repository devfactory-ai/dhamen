/**
 * ClaimFormPage - Create New Claim Page
 *
 * Dedicated page for creating a new claim (replaces dialog)
 */
import { useNavigate, Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NewClaimForm } from '../components/NewClaimForm';

export function ClaimFormPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/claims" className="hover:text-gray-900 transition-colors">Demandes PEC</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Nouvelle Demande</span>
      </nav>
      <PageHeader
        title="Nouvelle Prise en Charge"
        description="Créer une nouvelle demande de prise en charge"
      />

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
