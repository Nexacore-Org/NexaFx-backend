Given that an inspection status is Completed, when the Admin opens the inspection details, then the system shall display the Restart Inspection button.

Given that an inspection status is not Completed, when the Admin opens the inspection details, then the system shall not display the Restart Inspection button.

Given that the Admin clicks Restart Inspection, then the system shall require a mandatory comment before the action can be completed.

Given that the Admin restarts an inspection, then the system shall allow the Admin to select a new assessor from the list of eligible personnel.

Given that the restart is successful, then the system shall retain the existing inspection record and shall not create a new inspection record.

Given that the inspection is restarted, then the system shall retain all previous inspection information, comments, logs, documents, and history.

Given that the inspection class is Motor, when the inspection is restarted, then the system shall move the inspection to the stage where the Begin Inspection button is available to the newly assigned assessor.

Given that the inspection class is Property, when the inspection is restarted, then the system shall move the inspection to the Schedule Visit stage for the newly assigned assessor.

Given that a new assessor is assigned, then the system shall update the inspection to reflect the new assessor.

Given that a new assessor has been assigned to a restarted inspection, then the system shall send an email notification to the newly assigned assessor informing them that the inspection has been reassigned to them.

Given that the reassignment notification is sent, then the email shall include the relevant inspection details and a CTA that allows the new assessor to navigate directly to the inspection.

Given that the restart is completed, then the system shall record the restart action, Admin name, date/time, new assessor, and mandatory comment in the Comments section for audit purposes.

Given that the inspection is restarted, then the system shall not delete or overwrite the previous inspection activities and history.

