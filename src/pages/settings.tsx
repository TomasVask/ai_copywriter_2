import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { systemPrompts } from '@/system_prompts/system_prompts';
import { useSettingsStore } from "@/store/settingsStore";

const SettingsPage = () => {
  const temperature = useSettingsStore((s) => s.temperature);
  const setTemperature = useSettingsStore((s) => s.setTemperature);
  const topP = useSettingsStore((s) => s.topP);
  const setTopP = useSettingsStore((s) => s.setTopP);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Atgal į pokalbius
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Nustatymai</h1>
          <p className="text-gray-600 mt-2">Konfigūruok savo AI asistento nustatymus</p>
        </div>

        <div className="grid gap-6">
          {/* Model Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Modelių konfigūravimas</CardTitle>
              <CardDescription>
                Koreguok nustatymus, kaip AI modeliai turetu kurti reklamas
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Temperatūra: {temperature}</Label>
                  <Slider
                    value={[temperature]}
                    onValueChange={(value) => setTemperature(value[0])}
                    min={0}
                    max={1}
                    step={0.1}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500">
                    Kontroliuoja kūrybiškumą. Aukštesnė vertė - kūrybiškesnis, žemesnė vertė - labiau nuspėjamas
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Top-p: {topP}</Label>
                  <Slider
                    value={[topP]}
                    onValueChange={(value) => setTopP(value[0])}
                    min={0}
                    max={1}
                    step={0.05}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500">
                    Kontroliuoja atsakymų įvairovę. Aukštesnė vertė - platesnis žodžių pasirinkimas, žemesnė - labiau koncentruotas į populiariausius variantus.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Prompts Display */}
          <Card>
            <CardHeader>
              <CardTitle>Sisteminės užklausos</CardTitle>
              <CardDescription>
                Tai yra pamatinės taisyklės, kuriomis remiasi tavo AI asistentas. Jos padeda jam geriau suprasti, kaip reaguoti į tavo užklausas ir kokiu tonu bendrauti.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {systemPrompts.map((prompt) => (
                <div key={prompt.id} className="border rounded-lg p-4 bg-white">
                  <h4 className="font-semibold text-lg mb-3 text-gray-900">{prompt.title}</h4>
                  <div className="bg-gray-50 p-4 rounded-md">
                    <pre className="text-xs text-gray-700 whitespace-pre-line font-mono leading-relaxed">
                      {prompt.content}
                    </pre>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;