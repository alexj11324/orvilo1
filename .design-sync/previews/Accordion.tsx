import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@orvilo/ui';

export const Default = () => (
  <Accordion defaultValue={['billing']} style={{ width: 380 }}>
    <AccordionItem value="billing">
      <AccordionTrigger>How does billing work?</AccordionTrigger>
      <AccordionContent>
        You are billed per active member each month. Guests and archived members are free.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="export">
      <AccordionTrigger>Can I export my data?</AccordionTrigger>
      <AccordionContent>
        Yes. Admins can export issues and projects as CSV from Settings.
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="sso">
      <AccordionTrigger>Is SSO supported?</AccordionTrigger>
      <AccordionContent>SAML SSO is available on the Enterprise plan.</AccordionContent>
    </AccordionItem>
  </Accordion>
);
