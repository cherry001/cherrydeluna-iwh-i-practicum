require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const hubspot = require('@hubspot/api-client');

const app = express();
app.set('view engine', 'pug');
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// * Please DO NOT INCLUDE the private app access token in your repo. Don't do this practicum in your normal account.
const PORT = process.env.PORT || 3000;
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const HUBSPOT_PROJECT_OBJECT_TYPE = process.env.HUBSPOT_PROJECT_OBJECT_TYPE;

const hubspotClient = new hubspot.Client({ accessToken: HUBSPOT_API_KEY });

// TODO: ROUTE 1 - Create a new app.get route for the homepage to call your custom object data. Pass this data along to the front-end and create a new pug template in the views folder.
app.get('/', async (req, res) => {
  try {
    const apiResponse = await hubspotClient.crm.objects.basicApi.getPage(
      HUBSPOT_PROJECT_OBJECT_TYPE,
      10,
      undefined,
      ['name', 'description', 'status'],
      undefined,
      ['contacts'],
      false
    );

    const projectsWithContacts = apiResponse.results.map(async (project) => {
      const contactCount =
        project.associations && project.associations.contacts
          ? project.associations.contacts.results.length
          : 0;

      let contacts = [];

      if (contactCount > 0) {
        const contactIds = project.associations.contacts.results.map(
          (assoc) => assoc.id
        );

        const contactDetails = await hubspotClient.crm.contacts.batchApi.read({
          inputs: contactIds.map((id) => ({ id })),
          properties: ['firstname', 'lastname'],
        });

        contacts = contactDetails.results.map((contact) => ({
          id: contact.id,
          firstname: contact.properties.firstname,
          lastname: contact.properties.lastname,
        }));
      }

      return {
        project,
        contacts,
      };
    });

    const projects = await Promise.all(projectsWithContacts);
    res.render('index', {
      projects,
    });
  } catch (e) {
    console.error(
      e.message === 'HTTP request failed'
        ? JSON.stringify(e.response, null, 2)
        : e
    );
    res.status(500).send('Error retrieving projects and contacts');
  }
});

// TODO: ROUTE 2 - Create a new app.get route for the form to create or update new custom object data. Send this data along in the next route.

// TODO: ROUTE 3 - Create a new app.post route for the custom objects form to create or update your custom object data. Once executed, redirect the user to the homepage.

// * Localhost
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
