import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageLayout } from "@/components/page-layout";
import { ContentCard, Section } from "@/components/design-system";
import { GovernmentDisclaimer } from "@/components/government-disclaimer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Search, MapPin, Star, Phone, Mail, Users, Calculator } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

// Sample data for accountants - ready for new practitioners
const ACCOUNTANTS = [
  {
    id: 1,
    name: "Tax-Cents Accountants",
    specialization: "Accounting, Tax, Advisory",
    location: "Johannesburg",
    rating: 4.8,
    reviews: 58,
    image: "/attached_assets/TAX CENTS_1750498265803.jpg",
    bio: "Certified Tax Practitioner with 10+ years experience in personal and small business bookkeeping and tax optimization.",
    hourlyRate: "R550",
    languages: ["English"],
    email: "keo@nine28.co.za",
    bookingUrl: "https://calendly.com/keo-nine28/30min",
    phone: "+27 78 205 0870"
  }
  // Note: Ready for new practitioners to be registered
];

export default function TaxProsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const isMobile = useIsMobile();
  const { toast } = useToast();
  
  // Filter accountants based on search query
  const filteredAccountants = ACCOUNTANTS.filter(accountant => 
    accountant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    accountant.specialization.toLowerCase().includes(searchQuery.toLowerCase()) ||
    accountant.location.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const handleEmailClick = (accountant: any) => {
    if (accountant.email) {
      // Create mailto link with pre-filled subject and body
      const subject = encodeURIComponent(`Inquiry about ${accountant.specialization} services via Simple Slips`);
      const body = encodeURIComponent(`Hello ${accountant.name},\n\nI found your profile on Simple Slips and would like to inquire about your ${accountant.specialization} services.\n\nPlease let me know your availability for a consultation.\n\nBest regards`);
      
      // Open email client
      window.location.href = `mailto:${accountant.email}?subject=${subject}&body=${body}`;
    } else {
      toast({
        title: "Contact Information",
        description: "Email address not available for this practitioner.",
      });
    }
  };
  
  const handleBookConsultation = (accountant: any) => {
    if (accountant.bookingUrl) {
      // Open booking system in new tab
      window.open(accountant.bookingUrl, '_blank', 'noopener,noreferrer');
    } else {
      toast({
        title: "Booking System",
        description: `Please contact ${accountant.name} directly to schedule a consultation.`,
      });
    }
  };
  
  const headerActions = (
    <Users className="h-6 w-6 text-primary" />
  );

  return (
    <PageLayout 
      title="Find a Tax Professional"
      subtitle="Connect with certified accountants and tax experts in your area"
      showBackButton={true}
      headerActions={headerActions}
    >
      <GovernmentDisclaimer className="mb-6" />
      <Section>
        {/* Tax Dashboard CTA */}
        <div className="mb-6 p-4 sm:p-6 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-2 text-base sm:text-lg">Tax Planning Dashboard</h3>
              <p className="text-sm text-gray-600 leading-relaxed">Track deductions, estimate savings, and plan for tax season</p>
            </div>
            <Link href="/tax-dashboard" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto shrink-0">
                <Calculator className="h-4 w-4 mr-2" />
                Open Dashboard
              </Button>
            </Link>
          </div>
        </div>
        
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <Input
            className="pl-10"
            placeholder="Search by name, specialization or location"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="space-y-4">
          {filteredAccountants.length > 0 ? (
            filteredAccountants.map(accountant => (
              <ContentCard key={accountant.id} className="overflow-hidden">
                <div className="flex p-4">
                  <div className="w-20 h-20 rounded-none overflow-hidden flex-shrink-0 mr-4">
                    <img 
                      src={accountant.image} 
                      alt={accountant.name} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{accountant.name}</CardTitle>
                    <p className="text-sm text-primary font-medium">{accountant.specialization}</p>
                    <div className="flex items-center text-sm text-gray-500 mt-1">
                      <MapPin size={14} className="mr-1" />
                      <span>{accountant.location}</span>
                    </div>
                    {/* Hidden for authenticity - no fake reviews */}
                    {/* <div className="flex items-center mt-1">
                      <div className="flex items-center">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="ml-1 text-sm font-medium">{accountant.rating}</span>
                      </div>
                      <span className="text-sm text-gray-500 ml-1">
                        ({accountant.reviews} reviews)
                      </span>
                    </div> */}
                  </div>
                </div>
                <CardFooter className={cn(
                  "flex pt-3",
                  isMobile ? "flex-col gap-3" : "justify-between"
                )}>
                  <div className={cn(
                    "flex",
                    isMobile ? "w-full" : "gap-3"
                  )}>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className={cn(isMobile && "flex-1")}
                      onClick={() => handleEmailClick(accountant)}
                    >
                      <Mail className="h-4 w-4 mr-1" />
                      Email
                    </Button>
                  </div>
                  <Button 
                    size="sm" 
                    className={cn(
                      "bg-primary hover:bg-primary/90 text-white rounded-md font-semibold",
                      isMobile ? "w-full" : ""
                    )}
                    onClick={() => handleBookConsultation(accountant)}
                  >
                    Book Consultation
                  </Button>
                </CardFooter>
              </ContentCard>
            ))
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No tax professionals found matching your search.</p>
              <Button 
                variant="link" 
                onClick={() => setSearchQuery("")}
                className="mt-2 text-primary"
              >
                Clear search
              </Button>
            </div>
          )}
        </div>
      </Section>
    </PageLayout>
  );
}